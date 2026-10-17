"""
Assetto Corsa Python 3.3.5 AST Compatibility Validator
======================================================
Scans ac_sound_mixer.py to ensure strictly zero Python 3.6+ features
(f-strings, variable type hints, async/await) enter the mod.
"""

import ast
import sys
import os

def validate_ast(file_path):
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}", file=sys.stderr)
        return False

    with open(file_path, "r", encoding="utf-8") as f:
        code = f.read()

    try:
        tree = ast.parse(code, filename=file_path)
    except SyntaxError as e:
        print(f"Syntax error in {file_path}: {e}", file=sys.stderr)
        return False

    disallowed = []
    for node in ast.walk(tree):
        if isinstance(node, getattr(ast, "JoinedStr", ())):
            disallowed.append((node.lineno, "f-string (JoinedStr) not supported in Python 3.3"))
        elif isinstance(node, getattr(ast, "AnnAssign", ())):
            disallowed.append((node.lineno, "Variable type annotation (AnnAssign) not supported in Python 3.3"))
        elif isinstance(node, getattr(ast, "AsyncFunctionDef", ())):
            disallowed.append((node.lineno, "async def not supported in Python 3.3"))

    if disallowed:
        print(f"Python 3.3 incompatibilities in {file_path}:", file=sys.stderr)
        for lineno, msg in disallowed:
            print(f"  Line {lineno}: {msg}", file=sys.stderr)
        return False

    print(f"SUCCESS: {file_path} is 100% compatible with Assetto Corsa Python 3.3.5.")
    return True

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "apps/python/ac_sound_mixer/ac_sound_mixer.py"
    if not validate_ast(target):
        sys.exit(1)
    sys.exit(0)
