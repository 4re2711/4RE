"""Source-preserving dictionary extraction and SQLite search. No external services."""
from __future__ import annotations
import csv
import difflib
import json
import os
import re
import sqlite3
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_SKILL = Path(os.environ.get('CODEX_HOME', str(Path.home() / '.codex'))) / 'skills' / 'explain-vocabulary'
SKILL = Path(os.environ.get('VOCAB_SKILL_DIR', str(DEFAULT_SKILL)))
HAN = r'\u3400-\u9fff'
POS = r'(?:phrasal verb|modal verb|auxiliary verb|linking verb|exclamation|determiner|preposition|conjunction|pronoun|adjective|adverb|noun|verb|abbreviation|number|article)'

def normalize(s):
    return ' '.join(unicodedata.normalize('NFKC', s).replace('’', "'").strip().lower().split())

def clean(s):
    s = re.sub(r'[🔑🔊➤]', '', s)
    return re.sub(r'[ \t\xa0\u2002]+', ' ', s).strip(' \n')

def bilingual(s):
    """Keep labels and bilingual source intact; use the first CJK boundary only."""
    s = clean(s)
    m = re.search('[' + HAN + ']', s)
    if not m:
        return {'en': s, 'zh': ''}
    at = m.start()
    while at > 0 and s[at-1] in '（(“「':
        at -= 1
    return {'en': s[:at].strip(), 'zh': s[at:].strip()}

def restore_quiz_apostrophes(s):
    """Restore clear contractions lost during the source CSV's text export."""
    s=re.sub(r'\b([A-Za-z]+)n t\b',r"\1n't",s)
    s=re.sub(r'\b(I) m\b',r"\1'm",s)
    s=re.sub(r'\b(I|you|we|they|he|she|it|there) (ll|ve|re|d|s)\b',r"\1'\2",s,flags=re.I)
    s=re.sub(r'\b(company|department) s\b',r"\1's",s,flags=re.I)
    return s

def comparison_groups(text, entry):
    """Read existing dictionary comparison boxes, never infer synonym relationships."""
    groups = []
    for match in re.finditer(r'These words all[^\n]*\n', text):
        start = max(0, match.start()-240)
        if '◇' not in text[start:match.start()]:
            continue
        body = re.split(r'Patterns|🔑|➤|●', text[match.end():], maxsplit=1)[0]
        items, notes = [], []
        for line in body.splitlines():
            line = clean(line)
            if not line:
                continue
            if '? 用' in line or '?用' in line or re.match(r'.{0,100}\?\s*用', line):
                notes.append(line)
                continue
            m = re.match(r'^([a-z][a-z -]{0,30}?)\s+(?=\[|\(|to\b|a\b|an\b|the\b|of\b|used\b|[a-z])(.+)', line)
            if m and re.search('['+HAN+']', m[2]) and len(m[1].split()) <= 3:
                desc = m[2].split('◆')[0].strip()
                ex = m[2].split('◆')[1] if '◆' in m[2] else ''
                items.append({'word':m[1], 'description':desc, 'example':bilingual(ex) if ex else None})
        if len(items) >= 2:
            groups.append({'title':' / '.join(i['word'] for i in items), 'intro':clean(match[0]), 'items':items, 'notes':notes, 'source':'本地词典辨析', 'source_word':entry})
    return groups

def parse_entry(entry, text):
    pronunciation = {}
    for region, label in [('BrE','uk'), ('NAmE','us')]:
        m = re.search(region+r'\s*/([^/]+)/', text)
        if m:
            pronunciation[label] = '/'+m[1]+'/'
    # Match section headers via phonetics rather than every mention of a part of speech.
    headers = list(re.finditer(r'(?:BrE|NAmE)\s*/[^/]+/\s*(?:🔊\s*)?(?:'+POS+r')', text))
    prefix = text.split('BrE', 1)[0]
    pos = list(dict.fromkeys(re.findall(r'(?<![a-z])('+POS+r')(?![a-z])',prefix)))
    if not pos and headers:
        kind = re.search(POS+r'$', headers[0][0])
        if kind: pos = [kind[0]]
    if not pos:
        pos = list(dict.fromkeys(re.findall(r'(?<![a-z])('+POS+r')(?![a-z])', text[:400])))[:3]

    # Remove comparison boxes only from the extracted senses. Raw text and the
    # separate comparison index retain them, including every example and note.
    without_comparisons = re.sub(r'[A-Za-z /-]{0,90}◇[^🔑➤●]*', '', text)
    body = without_comparisons
    # Pronunciation and inflection boilerplate is preserved in raw, omitted in reading view.
    body = re.sub(r'(?:🔑\s*)?[^\n◆🔊➤●]{0,90}(?:BrE|NAmE)\s*/[^/]+/(?:\s*🔊)?', '', body)
    body = re.sub(r'present simple[^🔊◆➤🔑]+|past simple[^🔊◆➤🔑]+|past participle[^🔊◆➤🔑]+|-ing form[^🔊◆➤🔑]+', '', body)
    if headers:
        first = headers[0].end()
        # Header precedes the first comparison box so its offset is unchanged.
        body = without_comparisons[first:]
        # The first verbal definition follows the inflection forms.
        if body.startswith('present simple'):
            boundary = re.search(r'[➤🔑]|🔊\s*\[|🔊\s*to\b|🔊\s*~', body)
            if boundary:
                body = body[boundary.start():]
    body = re.sub(r'\n🔑[^\n]*?(?:BrE|NAmE).*?(?='+POS+r')', '\n', body)
    body = re.sub(r'(BrE|NAmE)\s*/[^/]+/\s*🔊?', '', body)
    # Give source markers explicit boundaries before building conservative excerpts.
    body = body.replace('➤','\n➤').replace('🔑','\n🔑').replace('●','\n●').replace('◆','\n◆')
    body = re.sub(r'(🔊\s*🔊)', '\n', body)
    body = re.sub(r'(?<![\w])\[(?:un)?countable\]', lambda m:'\n'+m[0], body)
    blocks = [s.strip() for s in body.splitlines() if clean(s)]
    senses, examples, collocations = [], [], []
    current = None
    heading = ''
    for block in blocks:
        if block.startswith('➤'):
            # Headings often run directly into a definition.
            heading = clean(block[1:])
            if len(heading) < 65:
                continue
        if block.startswith('●'):
            current = None
            continue
        if block.startswith('◆'):
            value = clean(block[1:])
            value = re.split(r'\s*➡|These words all|Patterns|\bNOTE\b|\bHELP\b', value)[0].strip()
            if not value or not re.search('['+HAN+']', value):
                continue
            example = bilingual(value)
            if len(value)<650:
                examples.append(example)
                if current is not None and len(current['examples'])<3:
                    current['examples'].append(example)
                # Short source phrases, not entire sentences mislabeled as collocations.
                if len(example['en'])<100 and len(example['en'].split())<=14 and not re.search(r'[.!?][\x27\x22]?$|\(=', example['en']) and not example['en'].startswith('~'):
                    collocations.append(example)
            continue
        value = clean(block)
        if not value or value.startswith(('Patterns','➡','SYN','OPP','NOTE','HELP')):
            continue
        if not re.search('['+HAN+']',value):
            continue
        if '◇' in value or 'These words all' in value:
            continue
        if len(value)>600:
            continue
        # Comparison explanations belong in a dedicated section, not senses.
        if re.match(r'^[a-z -]+\s{2,}',block) or '? 用' in value:
            current = None
            continue
        value = re.sub(r'^(?:'+POS+r')(?=\[|~|\s|\()', '', value).strip()
        current={'text':value, 'heading': heading if len(heading)<65 else '', 'examples':[]}
        senses.append(current)
        heading=''
    # Patterns sections contain actual collocation patterns authored in the source.
    for pattern in re.finditer(r'Patterns([^🔑➤●]+)',text):
        for line in pattern[1].splitlines():
            line=clean(line)
            if line and len(line)<180 and not re.search(r'(These words|BrE|NAmE|\? 用|➡|means|意为)',line):
                collocations.append(bilingual(line))
    syntax_token = r'(?:sb|sth|yourself|oneself|doing|do|to|for|of|from|with|about|on|in|into|at|by|as|out|up|off|over|through|against|adj\.|adv\.|prep\.|noun|that|\+|/|\(|\)|…|\s)'
    for m in re.finditer(r'~\s+('+syntax_token+r'+)',text):
        pattern=m[1].strip()
        if pattern and len(pattern)<65 and pattern.count('(')==pattern.count(')'):
            collocations.append({'en':entry+' '+pattern,'zh':'词典用法结构；sb 指某人，sth 指某事物'})
    def unique(items,key):
        seen=set(); out=[]
        for item in items:
            token=item[key]
            if token not in seen:
                seen.add(token);out.append(item)
        return out
    syn=list(dict.fromkeys(clean(m[1]) for m in re.finditer(r'\bSYN\s+([A-Za-z][A-Za-z -]{0,35}?)(?=\s*(?:◆|OPP|🔑|\n|$))',text)))
    return {'word':entry,'pronunciation':pronunciation,'pos':pos,'senses':unique(senses,'text')[:24], 'examples':unique(examples,'en')[:60], 'collocations':unique(collocations,'en')[:32], 'synonyms':syn[:12], 'raw':text}

class Lexicon:
    def __init__(self, db=None):
        self.path = Path(db or ROOT/'data'/'dictionary.sqlite3')
        self.path.parent.mkdir(parents=True,exist_ok=True)
        self.source=SKILL/'assets'/'oald9.csv'
        self.notes=json.loads((ROOT/'data'/'study-notes.json').read_text(encoding='utf-8'))
        # Local installs can rebuild from the skill CSV. Deployments carry the
        # generated SQLite index and intentionally do not need ~/.codex.
        if self.source.exists():
            self._build()
        elif not self.path.exists():
            raise FileNotFoundError(f'No dictionary index or source CSV: {self.path}')
        with self.connect() as c:
            self.word_count=c.execute('select count(*) from entries').fetchone()[0]
            self.group_count=c.execute('select count(distinct payload) from comparisons').fetchone()[0]
            self.simple_words=[r[0] for r in c.execute("select key from entries where length(key) between 2 and 28 and key not glob '*[^a-z-]*'")]
        question_source = ROOT/'data'/'neccs.csv'
        if not question_source.exists():
            question_source = SKILL/'assets'/'neccs.csv'
        with question_source.open(encoding='utf-8',newline='') as f:
            self.questions=list(csv.DictReader(f))

    def connect(self):
        return sqlite3.connect(self.path)

    def _build(self):
        signature=f'v4:{self.source.stat().st_size}:{self.source.stat().st_mtime_ns}'
        with self.connect() as c:
            c.execute('create table if not exists meta (key text primary key, value text)')
            stored=c.execute("select value from meta where key='source'").fetchone()
            if stored and stored[0]==signature:
                return
            c.execute('drop table if exists entries')
            c.execute('drop table if exists comparisons')
            c.execute('create table entries (key text primary key, word text, text text)')
            c.execute('create table comparisons (word text, payload text)')
            groups=set()
            with self.source.open(encoding='utf-8',newline='') as f:
                for row in csv.DictReader(f):
                    key=normalize(row['entry'])
                    c.execute('insert into entries values (?,?,?) on conflict(key) do update set text=case when length(excluded.text)>length(entries.text) then excluded.text else entries.text end',(key,row['entry'],row['text']))
                    if '◇' in row['text']:
                        for group in comparison_groups(row['text'],row['entry']):
                            token=group['title']
                            if token in groups:continue
                            groups.add(token)
                            payload=json.dumps(group,ensure_ascii=False)
                            for item in group['items']:
                                c.execute('insert into comparisons values (?,?)',(normalize(item['word']),payload))
            c.execute('create index comparisons_word on comparisons(word)')
            c.execute("insert or replace into meta values ('source',?)",(signature,))

    def suggest(self, word, limit=8):
        key=normalize(word)
        if not key:return []
        with self.connect() as c:
            rows=c.execute('select word from entries where key>=? and key<? order by length(key),key limit ?',(key,key+'\uffff',limit)).fetchall()
        return [r[0] for r in rows]

    def lookup(self,word):
        key=normalize(word)
        if not key or len(key)>100:
            return {'found':False,'query':word,'suggestions':[]}
        candidates=[key]
        irregular={'went':'go','gone':'go','made':'make','taken':'take','took':'take','children':'child','better':'good','best':'good','worse':'bad','written':'write','wrote':'write','thought':'think','bought':'buy','felt':'feel','seen':'see','saw':'see','was':'be','were':'be','had':'have'}
        if key in irregular:candidates.append(irregular[key])
        if key.endswith('ies'):candidates.append(key[:-3]+'y')
        if key.endswith('s'):candidates.extend([key[:-1],key[:-2]])
        if key.endswith('ed'):candidates.extend([key[:-1],key[:-2],key[:-3] if key[-3:-2]==key[-4:-3] else ''])
        if key.endswith('ing'):candidates.extend([key[:-3],key[:-3]+'e',key[:-4] if key[-4:-3]==key[-5:-4] else ''])
        with self.connect() as c:
            row=None
            for candidate in candidates:
                row=c.execute('select word,text from entries where key=?',(candidate,)).fetchone()
                if row:break
            if not row:
                suggestions=self.suggest(key,5) or difflib.get_close_matches(key,self.simple_words,n=5,cutoff=.72)
                return {'found':False,'query':word,'suggestions':suggestions}
            # Many CSV records are explicit inflection/spelling redirects rather
            # than definitions. Resolve only the source-provided destination.
            visited=set()
            for _ in range(12):
                if not row[1].strip().startswith('@@@LINK='):break
                target=normalize(row[1].strip().split('=',1)[1].splitlines()[0])
                if target in visited:break
                visited.add(target)
                destination=c.execute('select word,text from entries where key=?',(target,)).fetchone()
                if not destination:break
                row=destination
            result=parse_entry(*row)
            groups=c.execute('select payload from comparisons where word=?',(normalize(row[0]),)).fetchall()
        result.update({'found':True,'query':word,'resolved':normalize(row[0])!=key, 'comparisons':[json.loads(g[0]) for g in groups[:4]],'related':self.suggest(normalize(row[0])+' ',8), 'notes':self.notes.get(normalize(row[0])), 'source':'explain-vocabulary / oald9.csv'})
        return result

    def quiz(self,word,count=5):
        key=normalize(word)
        pattern=re.compile(r'(?<![a-z])'+re.escape(key)+r'(?![a-z])',re.I)
        out=[]
        for row in self.questions:
            if not pattern.search(row['choices']+' '+row['analysis']):continue
            choices=row['choices'].split('<sep>')
            try:answer=int(row['answer'])
            except ValueError:continue
            if not 0<=answer<len(choices):continue
            stem=re.sub(r'^.*?\b(\d{1,3})[.．]\s*', '',row['stem'],count=1)
            out.append({'id':row['id'],'stem':restore_quiz_apostrophes(stem),'choices':[restore_quiz_apostrophes(x) for x in choices],'answer':answer,'analysis':row['analysis'],'source':row['src'].removesuffix('.json')})
            if len(out)>=count:break
        return out
