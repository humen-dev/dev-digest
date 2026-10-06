/**
 * Pure "Grounded command" rules (SPEC-03 U1, rules 1-8, AC-49, AC-50). No
 * I/O — see `onboarding-grounding.test.ts` for the full `groundTour`
 * pipeline.
 */
import { describe, it, expect } from 'vitest';
import { groundCommand } from '../src/modules/onboarding/domain/commands.js';

describe('groundCommand — rule 1 (verbatim, whitespace collapsed)', () => {
  it('a verbatim command in a source file grounds to that file, whitespace collapsed', () => {
    const sources = new Map([['README.md', 'Install:\n\n    curl   https://example.com/install.sh | sh\n']]);
    expect(groundCommand('curl https://example.com/install.sh | sh', sources)).toBe('README.md');
  });

  it('sudo … is kept under rule 1', () => {
    const sources = new Map([['README.md', 'sudo apt-get update']]);
    expect(groundCommand('sudo apt-get update', sources)).toBe('README.md');
  });

  it('an unmatched command grounds to nothing', () => {
    expect(groundCommand('rm -rf /', new Map())).toBeNull();
  });
});

describe('groundCommand — rules 2/3 (package.json)', () => {
  const sources = new Map([['package.json', JSON.stringify({ scripts: { dev: 'vite' } })]]);

  it('AC-49: npm run <script> without that script is dropped', () => {
    expect(groundCommand('npm run deploy', sources)).toBeNull();
  });

  it('AC-49: pnpm <script> with that script is kept, source package.json', () => {
    expect(groundCommand('pnpm dev', sources)).toBe('package.json');
  });

  it('<pm> install grounds when a package.json exists, regardless of scripts', () => {
    expect(groundCommand('npm install', sources)).toBe('package.json');
    expect(groundCommand('pnpm i', sources)).toBe('package.json');
  });

  it('a package.json parse failure means rule 3 does not match', () => {
    const broken = new Map([['package.json', '{ not json']]);
    expect(groundCommand('npm run dev', broken)).toBeNull();
  });
});

describe('groundCommand — rule 4 (Makefile)', () => {
  it('make <target> grounds to the Makefile when the target exists', () => {
    const sources = new Map([['Makefile', 'build:\n\techo building\n\ntest: build\n\techo testing\n']]);
    expect(groundCommand('make test', sources)).toBe('Makefile');
    expect(groundCommand('make deploy', sources)).toBeNull();
  });
});

describe('groundCommand — rule 5 (docker compose)', () => {
  const compose = 'services:\n  postgres:\n    image: postgres\n  redis:\n    image: redis\n';
  const sources = new Map([['docker-compose.yml', compose]]);

  it('AC-50: every named service exists in the compose file — source is that file', () => {
    expect(groundCommand('docker compose up -d postgres redis', sources)).toBe('docker-compose.yml');
  });

  it('a service missing from the compose file is not grounded', () => {
    expect(groundCommand('docker compose up -d postgres mongo', sources)).toBeNull();
  });

  it('docker-compose (hyphenated) is recognised too', () => {
    expect(groundCommand('docker-compose up postgres', sources)).toBe('docker-compose.yml');
  });
});

describe('groundCommand — rule 6 (env copy)', () => {
  it('cp of a tracked .env.example grounds to that file', () => {
    const sources = new Map([['.env.example', 'FOO=bar']]);
    expect(groundCommand('cp .env.example .env', sources)).toBe('.env.example');
  });

  it('cp of a non-tracked file does not ground', () => {
    expect(groundCommand('cp .env.example .env', new Map())).toBeNull();
  });
});

describe('groundCommand — rule 7 (manage.py)', () => {
  it('python manage.py <c> grounds when manage.py is tracked', () => {
    const sources = new Map([['manage.py', '']]);
    expect(groundCommand('python manage.py migrate', sources)).toBe('manage.py');
  });
});

describe('groundCommand — rule 8 (python installs)', () => {
  it('pip install -r <f> grounds to a tracked requirements file', () => {
    const sources = new Map([['requirements.txt', '']]);
    expect(groundCommand('pip install -r requirements.txt', sources)).toBe('requirements.txt');
    expect(groundCommand('pip install -r requirements-dev.txt', sources)).toBeNull();
  });

  it('pip install -e . / poetry install / uv sync ground to a tracked pyproject.toml', () => {
    const sources = new Map([['pyproject.toml', '']]);
    expect(groundCommand('pip install -e .', sources)).toBe('pyproject.toml');
    expect(groundCommand('poetry install', sources)).toBe('pyproject.toml');
    expect(groundCommand('uv sync', sources)).toBe('pyproject.toml');
  });

  it('without a tracked pyproject.toml, these commands are not grounded', () => {
    expect(groundCommand('poetry install', new Map())).toBeNull();
  });
});
