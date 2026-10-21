import json
import threading
import unittest
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from app import Handler
from lexicon import Lexicon

class WordroomTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lex=Lexicon()
        Handler.lexicon=cls.lex
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()

    def test_dictionary_is_real_and_complete(self):
        self.assertGreater(self.lex.word_count,200000)
        self.assertGreater(self.lex.group_count,50)
        self.assertGreater(len(self.lex.questions),1000)

    def test_lookup_case_and_whitespace(self):
        d=self.lex.lookup('  APPROACH  ')
        self.assertTrue(d['found']);self.assertEqual(d['word'],'approach')
        self.assertIn('noun',d['pos']);self.assertIn('verb',d['pos'])
        self.assertIn('to solving',d['notes']['tip'])

    def test_generic_lookup_and_sense_association(self):
        d=self.lex.lookup('happy')
        self.assertEqual(d['pos'],['adjective'])
        self.assertTrue(any('高兴' in s['text'] for s in d['senses']))
        self.assertFalse(any(s['text'].startswith('delighted') for s in d['senses']))
        self.assertFalse(any('proud parents'==c['en'] for c in d['collocations']))
        self.assertTrue(any('glad' in g['title'] for g in d['comparisons']))

    def test_comparison_does_not_swallow_definition(self):
        d=self.lex.lookup('economic')
        self.assertTrue(any('有利可图' in s['text'] for s in d['senses']))

    def test_no_fabricated_comparison(self):
        d=self.lex.lookup('aberration')
        self.assertTrue(d['found']);self.assertIsNone(d['notes']);self.assertEqual(d['comparisons'],[])

    def test_collocation_pattern_boundaries(self):
        d=self.lex.lookup('method')
        self.assertIn('method (of doing sth)',[x['en'] for x in d['collocations']])
        self.assertFalse(any('the best method for arriving' in x['en'] for x in d['collocations']))

    def test_spelling_suggestions_and_missing(self):
        self.assertIn('approach',self.lex.lookup('approuch')['suggestions'])
        self.assertFalse(self.lex.lookup('zzzznotawordzzzz')['found'])
        self.assertEqual(self.lex.suggest(''),[])

    def test_prefix_and_phrase(self):
        self.assertIn('approach',self.lex.suggest('approa'))
        self.assertTrue(self.lex.lookup('give up')['found'])

    def test_source_alias_resolves_full_definition(self):
        for query,headword in [('approached','approach'),('studying','study')]:
            d=self.lex.lookup(query)
            self.assertTrue(d['resolved']);self.assertEqual(d['word'],headword)
            self.assertGreater(len(d['senses']),0)
            self.assertNotIn('@@@LINK=',d['raw'])

    def test_quiz_answer_indices(self):
        qs=self.lex.quiz('make');self.assertEqual(len(qs),5)
        self.assertIn("I'm",qs[0]['stem'])
        for q in qs:
            self.assertTrue(0<=q['answer']<len(q['choices']))
            self.assertTrue(q['analysis'])
        self.assertEqual(self.lex.quiz('zzzznotawordzzzz'),[])

    def test_js_mime_and_utf8(self):
        with urllib.request.urlopen(self.base+'/app.js') as r:
            self.assertIn('application/javascript',r.headers['Content-Type'])
            self.assertEqual(r.headers['X-Content-Type-Options'],'nosniff')
            self.assertIn('词间',r.read().decode('utf-8'))

    def test_api_exact_and_no_sql_interpolation(self):
        with urllib.request.urlopen(self.base+'/api/lookup?word=approach') as r:
            self.assertEqual(json.load(r)['word'],'approach')
        self.assertFalse(self.lex.lookup("'; DROP TABLE entries; --")['found'])
        self.assertTrue(self.lex.lookup('apple')['found'])

    def test_unknown_static_path(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(self.base+'/../README.md')
        self.assertEqual(error.exception.code,404)

if __name__=='__main__':unittest.main()
