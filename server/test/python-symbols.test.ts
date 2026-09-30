import { describe, it, expect } from 'vitest';
import {
  PY_BUILTINS,
  PY_KEYWORDS,
  parsePythonReferences,
  parsePythonSymbols,
} from '../src/adapters/python/symbols.js';

const PHONE = `import re

_NON_DIGITS = re.compile(r"\D+")


def _digits(raw):
    return _NON_DIGITS.sub("", raw or "")


def normalize_phone(raw):
    """Return '+' followed by the digits of raw, or '' when there are none."""
    digits = _digits(raw)
    return f"+{digits}" if digits else ""
`;

const VIEWS = `from django.shortcuts import render
from rest_framework import viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from apps.tools import phone

from .models import Contact
from .serializers import ContactSerializer


def contact_list(request):
    return render(request, "contacts/list.html", {"contacts": Contact.objects.all()})


@api_view(["GET", "POST"])
def contact_lookup(request):
    return Response({"phone": phone.normalize_phone(request.GET.get("q"))})


class ContactViewSet(viewsets.ModelViewSet):
    queryset = Contact.objects.all()
    serializer_class = ContactSerializer

    @action(detail=False, methods=["post"], url_path="import_csv")
    def import_csv(self, request):
        rows = [phone.normalize_phone(r) for r in request.data.get("phones", [])]
        return Response({"imported": len(rows)})
`;

const SERIALIZERS = `from rest_framework import serializers

from apps.tools.phone import normalize_phone

from .models import Contact


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = "__all__"

    def validate_phone(self, value):
        return normalize_phone(value)
`;

const refs = (src: string) => parsePythonReferences('x.py', src);
const has = (r: { toSymbol: string; line: number }[], name: string, line: number) =>
  r.some((x) => x.toSymbol === name && x.line === line);

describe('parsePythonSymbols', () => {
  it('phone.py: exported functions with signatures', () => {
    const syms = parsePythonSymbols('apps/tools/phone.py', PHONE, 200);
    expect(syms.map((s) => [s.name, s.kind, s.exported, s.signature])).toEqual([
      ['_digits', 'function', true, 'def _digits(raw)'],
      ['normalize_phone', 'function', true, 'def normalize_phone(raw)'],
    ]);
  });

  it('views.py: functions, class, and methods under both names', () => {
    const syms = parsePythonSymbols('views.py', VIEWS, 200);
    const find = (name: string, kind: string) => syms.find((s) => s.name === name && s.kind === kind);
    expect(find('contact_list', 'function')?.line).toBe(12);
    expect(find('contact_lookup', 'function')).toBeTruthy();
    const cls = find('ContactViewSet', 'class');
    expect(cls?.line).toBe(21);
    expect(cls?.endLine).toBe(28);
    const m1 = find('ContactViewSet.import_csv', 'method');
    const m2 = find('import_csv', 'method');
    expect(m1).toBeTruthy();
    expect(m2).toBeTruthy();
    expect(m1?.line).toBe(m2?.line);
    expect(m1?.endLine).toBe(28);
    expect(new Set(syms.map((s) => `${s.name}:${s.kind}:${s.line}`)).size).toBe(syms.length);
  });

  it('trims signatures at maxSignatureChars with an ellipsis', () => {
    const [s] = parsePythonSymbols('p.py', PHONE, 10);
    expect(s?.signature).toBe('def _digi…');
    expect(s?.signature?.length).toBe(10);
  });
});

describe('parsePythonReferences', () => {
  it('views.py: calls, from-bound names, module attrs; no builtins or declarations', () => {
    const r = refs(VIEWS);
    expect(has(r, 'normalize_phone', 18)).toBe(true);
    expect(has(r, 'normalize_phone', 27)).toBe(true);
    expect(has(r, 'phone', 18)).toBe(true);
    expect(has(r, 'ContactSerializer', 23)).toBe(true);
    expect(has(r, 'Contact', 13)).toBe(true);
    expect(has(r, 'render', 13)).toBe(true);
    expect(has(r, 'Response', 18)).toBe(true);
    expect(has(r, 'action', 25)).toBe(true);
    expect(has(r, 'api_view', 16)).toBe(true);
    // builtins, declarations and import lines are excluded
    expect(r.some((x) => x.toSymbol === 'len')).toBe(false);
    expect(r.some((x) => x.line <= 9)).toBe(false);
    expect(r.some((x) => x.toSymbol === 'contact_list')).toBe(false);
    expect(r.some((x) => x.toSymbol === 'import_csv')).toBe(false);
    // dedupe on (toSymbol, line)
    expect(new Set(r.map((x) => `${x.toSymbol}:${x.line}`)).size).toBe(r.length);
  });

  it('serializers.py: normalize_phone at the validate_phone body line', () => {
    expect(has(refs(SERIALIZERS), 'normalize_phone', 14)).toBe(true);
  });

  it('rule 1: aliased from-import binds to the original name', () => {
    expect(refs('from a import b as c\nc()\n')).toEqual([{ toSymbol: 'b', line: 2 }]);
  });

  it('rule 1: unbound bare name is emitted only when called', () => {
    const r = refs('def f():\n    helper()\n    value\n');
    expect(r).toEqual([{ toSymbol: 'helper', line: 2 }]);
  });

  it('rule 2: module-bound head emits s1; call also emits rightmost segment', () => {
    const r = refs('import a.b\nimport x.y as z\na.mod.fn()\nz.attr\nq.r.s()\n');
    expect(has(r, 'mod', 3)).toBe(true);
    expect(has(r, 'fn', 3)).toBe(true);
    expect(has(r, 'attr', 4)).toBe(true);
    // unbound head, call -> only rightmost segment
    expect(r.filter((x) => x.line === 5)).toEqual([{ toSymbol: 's', line: 5 }]);
  });

  it('rule 2: self.x() emits only x', () => {
    const r = refs('class A:\n    def m(self):\n        self.x()\n');
    expect(r.filter((x) => x.line === 3)).toEqual([{ toSymbol: 'x', line: 3 }]);
  });

  it('rule 3: builtins and keywords are never emitted; constants exist', () => {
    const r = refs('x = len(y)\nsuper().foo()\n');
    expect(r.some((x) => x.toSymbol === 'len' || x.toSymbol === 'super')).toBe(false);
    expect(PY_BUILTINS.has('len')).toBe(true);
    expect(PY_KEYWORDS.has('lambda')).toBe(true);
  });

  it('rule 3: a name at its own declaration line is skipped', () => {
    const r = refs('from m import f\n\n\ndef f(): pass\n');
    expect(r.some((x) => x.toSymbol === 'f' && x.line === 4)).toBe(false);
  });
});
