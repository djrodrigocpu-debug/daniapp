/**
 * Versão do aplicativo (Masterplan §7.1; Anexo D — T29: versão exibida
 * corresponde ao build). Nunca hardcoded divergente do build.
 */
import { AppConfig } from '../../config/env';
import { runtimeConfig } from '../../config/runtime';

/**
 * Versão efetiva. Prioriza `EXPO_PUBLIC_APP_VERSION` (injetada no build);
 * o fallback é neutro e explicitamente "não configurado".
 */
export function appVersion(): string {
  const v = runtimeConfig.appVersion;
  return v && v !== '0.0.0' ? v : 'dev';
}

/**
 * Modo de dados REAL, derivado da configuração — não da versão.
 *
 * POR QUE ESTE TIPO EXISTE. O Perfil anunciava, em texto fixo, "Escopo da versão
 * 1.2" e "Os dados permanecem no aparelho nesta versão". Desde a 1.3.0 isso é
 * falso no build corporativo: com backend configurado os dados operacionais são
 * gravados e lidos no ambiente corporativo, e nada de negócio fica no aparelho.
 * A frase envelheceu porque estava presa a um número de versão e a um estado de
 * persistência que mudou. O modo passa a ser DERIVADO, e a versão continua vindo
 * de `appVersion()` — a tela não escreve nenhum dos dois à mão.
 *
 *  - `corporate`   → há backend configurado; os repositórios remotos são a fonte;
 *  - `local-demo`  → desenvolvimento sem backend; store local é a fonte (§17);
 *  - `unconfigured`→ homologação/produção SEM backend: degrada para store local,
 *                    mas não é demonstração — é ausência de configuração, e
 *                    precisa ser dita como tal em vez de fingir ambiente.
 */
export type DataMode = 'corporate' | 'local-demo' | 'unconfigured';

/** Puro e injetável (mesmo padrão de `loadConfig`/`resolveFeatureFlags`). */
export function resolveDataMode(config: Pick<AppConfig, 'environment' | 'isConfigured'>): DataMode {
  if (config.isConfigured) return 'corporate';
  return config.environment === 'development' ? 'local-demo' : 'unconfigured';
}

/**
 * Aviso de ambiente e persistência apresentado no Perfil. Cada texto vale para o
 * modo correspondente e para nenhum outro; nenhum deles cita versão, fornecedor,
 * URL, chave ou detalhe de infraestrutura.
 *
 * A ressalva de sessão só aparece no modo corporativo porque só ali existe a
 * distinção: a sessão autenticada persiste no dispositivo (`localStorage` no web,
 * `AsyncStorage` no nativo — ver `services/supabase/client`) enquanto o dado
 * operacional não. Nos modos locais o aparelho guarda tudo, e dizer "sessão e
 * preferências" sugeriria uma separação que não existe.
 */
export interface DataModeNotice {
  title: string;
  body: string;
}

export function dataModeNoticeFor(mode: DataMode): DataModeNotice {
  switch (mode) {
    case 'corporate':
      return {
        title: 'Ambiente corporativo',
        body:
          'Os dados autorizados são sincronizados com o ambiente corporativo conforme seu perfil e escopo de acesso. ' +
          'Informações de sessão e preferências podem permanecer temporariamente neste dispositivo.',
      };
    case 'local-demo':
      return {
        title: 'Demonstração local',
        body:
          'Esta é uma demonstração sem ambiente corporativo. O que você registrar aqui fica somente neste dispositivo ' +
          'e não é enviado para nenhum outro lugar.',
      };
    case 'unconfigured':
      return {
        title: 'Ambiente corporativo indisponível',
        body:
          'Este aplicativo não está conectado ao ambiente corporativo. O que você registrar fica somente neste ' +
          'dispositivo e não é enviado. Procure o administrador antes de usar para trabalho.',
      };
  }
}

/** Rótulo curto do modo, para a linha "Modo de dados". */
export function dataModeLabelFor(mode: DataMode): string {
  switch (mode) {
    case 'corporate':
      return 'Corporativo';
    case 'local-demo':
      return 'Demonstração local';
    case 'unconfigured':
      return 'Não configurado';
  }
}

/** Modo efetivo do runtime — o que a tela consome. */
export function dataMode(): DataMode {
  return resolveDataMode(runtimeConfig);
}

export function dataModeLabel(): string {
  return dataModeLabelFor(dataMode());
}

export function dataModeNotice(): DataModeNotice {
  return dataModeNoticeFor(dataMode());
}
