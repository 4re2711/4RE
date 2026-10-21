"""Run with python -X utf8 app.py. Localhost only, standard library only."""
import argparse
import json
import mimetypes
import re
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from lexicon import Lexicon, ROOT

class Handler(BaseHTTPRequestHandler):
    lexicon = None
    def reply(self,data,status=200,kind='application/json; charset=utf-8'):
        payload=json.dumps(data,ensure_ascii=False).encode('utf-8') if isinstance(data,(dict,list)) else data
        self.send_response(status)
        self.send_header('Content-Type',kind)
        self.send_header('Content-Length',str(len(payload)))
        self.send_header('Cache-Control','no-store' if kind.startswith('application/json') else 'no-cache')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        url=urlparse(self.path)
        query=parse_qs(url.query).get('word',[''])[0].strip()
        if len(query)>100:
            return self.reply({'error':'请输入 100 个字符以内的单词或短语。'},400)
        try:
            if url.path=='/api/health':return self.reply({'ok':True,'app':'wordroom'})
            if url.path=='/api/stats':return self.reply({'entries':self.lexicon.word_count,'comparisons':self.lexicon.group_count,'questions':len(self.lexicon.questions),'notes':len(self.lexicon.notes)})
            if url.path=='/api/suggest':return self.reply({'words':self.lexicon.suggest(query)})
            if url.path=='/api/lookup':return self.reply(self.lexicon.lookup(query))
            if url.path=='/api/quiz':return self.reply({'word':query,'questions':self.lexicon.quiz(query) if query else []})
            routes={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/favicon.svg':'favicon.svg'}
            if url.path not in routes:return self.reply({'error':'页面不存在'},404)
            path=ROOT/'static'/routes[url.path]
            kind={'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}.get(path.suffix,'application/octet-stream')
            if kind.startswith('text/') or kind=='application/javascript':kind+='; charset=utf-8'
            return self.reply(path.read_bytes(),kind=kind)
        except (BrokenPipeError,ConnectionResetError):
            pass
        except Exception as exc:
            print('Request failed:',type(exc).__name__,str(exc),flush=True)
            self.reply({'error':'读取词条失败，请重试。'},500)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=int(os.environ.get('PORT','8766')))
    args=parser.parse_args()
    print('Preparing local dictionary…',flush=True)
    Handler.lexicon=Lexicon()
    server=ThreadingHTTPServer(('0.0.0.0',args.port),Handler)
    print(f'Wordroom ready: http://0.0.0.0:{args.port} ({Handler.lexicon.word_count:,} entries)',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:server.server_close()
