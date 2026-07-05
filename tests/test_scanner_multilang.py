"""Multi-language scanning. Built in tmp_path so the Python-only sample/ (used by
other tests) stays untouched."""
from okf_scanner import scan_repo


def _write(root, path, content):
    p = root / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")


def test_javascript_relative_imports(tmp_path):
    _write(tmp_path, "src/index.js",
           "import { greet } from './greet';\n"
           "import util from './lib/util.js';\n"
           "import React from 'react';\n")           # external → ignored
    _write(tmp_path, "src/greet.js", "import { fmt } from './lib/util';\nexport const greet = () => fmt('hi');\n")
    _write(tmp_path, "src/lib/util.js", "export const fmt = (s) => s;\nexport default fmt;\n")

    c = {x.id: x for x in scan_repo(str(tmp_path))}
    assert set(c) == {"src/index", "src/greet", "src/lib/util"}
    assert set(c["src/index"].links) == {"src/greet", "src/lib/util"}   # 'react' not linked
    assert c["src/greet"].links == ["src/lib/util"]
    assert c["src/lib/util"].links == []
    assert c["src/index"].type == "package"        # index.js is the dir entry
    assert c["src/index"].language == "javascript"


def test_typescript_and_tsx_and_require(tmp_path):
    _write(tmp_path, "app/main.ts", "import { Router } from './router';\nimport { View } from './ui/View';\n")
    _write(tmp_path, "app/router.ts", "export class Router {}\n")
    _write(tmp_path, "app/ui/View.tsx",
           "import { Router } from '../router';\n"
           "const B = require('./widgets/Button');\n")
    _write(tmp_path, "app/ui/widgets/Button.tsx", "export const Button = () => null;\n")
    _write(tmp_path, "app/main.test.ts", "import { Router } from './router';\n")

    c = {x.id: x for x in scan_repo(str(tmp_path))}
    assert set(c["app/main"].links) == {"app/router", "app/ui/View"}
    assert c["app/router"].links == []
    assert set(c["app/ui/View"].links) == {"app/router", "app/ui/widgets/Button"}  # '../router' + require()
    assert c["app/ui/View"].language == "typescript"
    assert c["app/main"].type == "module"
    assert c["app/main.test"].type == "test"       # *.test.ts


def test_mixed_python_and_js_no_cross_links(tmp_path):
    _write(tmp_path, "svc/__init__.py", "")
    _write(tmp_path, "svc/app.py", "from svc import db\n")
    _write(tmp_path, "svc/db.py", "")
    _write(tmp_path, "web/app.js", "import './api';\n")
    _write(tmp_path, "web/api.js", "")

    c = {x.id: x for x in scan_repo(str(tmp_path))}
    assert set(c["svc/app"].links) == {"svc", "svc/db"}   # python: package + member
    assert c["svc/app"].language == "python"
    assert c["web/app"].links == ["web/api"]              # js relative import
    assert c["web/app"].language == "javascript"


def test_unparseable_file_is_skipped_not_fatal(tmp_path):
    _write(tmp_path, "a.js", "import './b';\nthis is not valid js ((( ;\n")
    _write(tmp_path, "b.js", "export const x = 1;\n")
    # A broken file must still yield a concept (possibly with best-effort links), never crash.
    c = {x.id: x for x in scan_repo(str(tmp_path))}
    assert "a" in c and "b" in c
