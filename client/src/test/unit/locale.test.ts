import { strict as assert } from 'assert';
import {
  chooseLang,
  extensionLang,
  parseLang,
  PHRASES,
  readStoredLang,
  STORAGE_KEY,
  translate,
  translateLine,
  writeLang,
} from '../../locale';

suite('UI language', () => {
  test('parseLang accepts only es and en', () => {
    assert.strictEqual(parseLang('en'), 'en');
    assert.strictEqual(parseLang('es'), 'es');
    for (const bad of ['fr', 'EN', 'ES', '', 'spanish', 'en-US', null, undefined, 1, 'english']) {
      assert.strictEqual(parseLang(bad), null);
    }
  });

  test('a stored choice wins over the browser language', () => {
    assert.strictEqual(chooseLang('en', 'es-MX'), 'en');
    assert.strictEqual(chooseLang('es', 'en-US'), 'es');
  });

  test('without a stored choice, Spanish browsers stay in Spanish', () => {
    assert.strictEqual(chooseLang(null, 'es-ES'), 'es');
    assert.strictEqual(chooseLang(undefined, 'es'), 'es');
  });

  test('without a stored choice, every other browser language is English', () => {
    assert.strictEqual(chooseLang(null, 'en-US'), 'en');
    assert.strictEqual(chooseLang('fr', 'fr-FR'), 'en');
    assert.strictEqual(chooseLang(null, undefined), 'en');
    assert.strictEqual(chooseLang('', ''), 'en');
  });

  test('the editor setting follows the same rule', () => {
    assert.strictEqual(extensionLang('es', 'auto'), 'es');
    assert.strictEqual(extensionLang('en', 'auto'), 'en');
    assert.strictEqual(extensionLang('es', 'en'), 'en');
    assert.strictEqual(extensionLang('en', 'spanish'), 'en');
  });

  test('corrupt localStorage is ignored and removed', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
    };
    Object.defineProperty(global, 'localStorage', { configurable: true, value: storage });
    storage.setItem(STORAGE_KEY, 'spanish');
    assert.strictEqual(readStoredLang(), null);
    assert.strictEqual(storage.getItem(STORAGE_KEY), null);
    writeLang('en');
    assert.strictEqual(readStoredLang(), 'en');
    writeLang('es');
    assert.strictEqual(storage.getItem(STORAGE_KEY), 'es');
  });

  test('exact phrases and interpolated log lines translate to English', () => {
    assert.strictEqual(translate('Mapa', 'en'), 'Map');
    assert.strictEqual(translate('Mapa', 'es'), 'Mapa');
    assert.strictEqual(translate('  Chasis  ', 'en'), '  Chassis  ');
    assert.strictEqual(translate('not a phrase', 'en'), 'not a phrase');
    assert.strictEqual(
      translateLine('Compilado inverter.bio: sin errores, 1 circuitos, 0 diagnósticos, 3 ms.', 'en'),
      'Compiled inverter.bio: no errors, 1 circuits, 0 diagnostics, 3 ms.',
    );
    assert.strictEqual(translateLine('No hay circuito que simular.', 'es'), 'No hay circuito que simular.');
    assert.strictEqual(translateLine('7 archivos · rama local main', 'en'), '7 files · local branch main');
    assert.strictEqual(translateLine('Visible: sí', 'en'), 'Visible: yes');
  });

  test('English phrases are not themselves Spanish keys', () => {
    for (const value of Object.values(PHRASES)) {
      assert.strictEqual(PHRASES[value], undefined);
    }
  });
});
