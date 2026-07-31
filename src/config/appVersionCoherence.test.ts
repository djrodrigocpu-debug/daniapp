/**
 * Coerência da versão exibida (D-05).
 *
 * A tela de login anunciava "VERSÃO 2.0.0" numa build 1.3.0 porque a versão
 * exibida vinha de `EXPO_PUBLIC_APP_VERSION`, mantida à mão e independente do
 * manifesto. Estes testes travam as duas coisas que precisavam ser verdade e
 * não eram: a versão exibida é a do `app.json`, e os manifestos do repositório
 * não divergem entre si.
 *
 * O `2.0.0` é caso especial: é a versão que o proprietário RESERVOU para a
 * evolução nativa futura. Nenhum artefato do produto atual pode carimbá-la.
 */
import { describe, it, expect } from 'vitest';
import { manifestVersion } from './appManifest';
import { runtimeConfig } from './runtime';
import { appVersion } from '../domain/version/appVersion';
import appJson from '../../app.json';
import packageJson from '../../package.json';
import releaseManifest from '../../release-manifest.json';

const VERSAO_RESERVADA_FUTURA = '2.0.0';

describe('versão exibida — fonte única (D-05)', () => {
  it('vem do manifesto do Expo (app.json)', () => {
    expect(manifestVersion()).toBe(appJson.expo.version);
  });

  it('é a versão que a tela de login exibe (runtimeConfig.appVersion)', () => {
    // `LoginScreen` renderiza literalmente `runtimeConfig.appVersion`.
    expect(runtimeConfig.appVersion).toBe(appJson.expo.version);
  });

  it('é a versão que o Perfil exibe (appVersion())', () => {
    expect(appVersion()).toBe(appJson.expo.version);
  });

  it('não exibe a versão reservada para a evolução futura', () => {
    expect(runtimeConfig.appVersion).not.toBe(VERSAO_RESERVADA_FUTURA);
  });
});

describe('manifestos do repositório não divergem', () => {
  it('package.json acompanha app.json', () => {
    expect(packageJson.version).toBe(appJson.expo.version);
  });

  it('extra.release acompanha app.json', () => {
    expect(appJson.expo.extra.release).toBe(appJson.expo.version);
  });

  it('release-manifest.json acompanha app.json', () => {
    expect(releaseManifest.version).toBe(appJson.expo.version);
  });

  it('build nativo avança de forma monotônica em relação à 1.3.0 (build 4)', () => {
    expect(Number(appJson.expo.ios.buildNumber)).toBeGreaterThan(4);
    expect(appJson.expo.android.versionCode).toBeGreaterThan(4);
  });
});
