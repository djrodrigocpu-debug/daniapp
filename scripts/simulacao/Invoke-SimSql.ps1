# =============================================================================
# AAPEx 1.3.5 - Laboratorio de Simulacao - executor de SQL guardado
# =============================================================================
# Executa SQL no projeto de homologacao SOMENTE depois que Guard-Ambiente.ps1
# autoriza. Herdado da simulacao anterior (scratchpad\simulacoes\
# AAPEX-134-2MESES-20260801-1342\q.ps1), com tres mudancas.
#
# 1. O alvo autorizado passa a ser a homologacao, nao o staging.
# 2. O Project Ref e argumento EXPLICITO, nunca inferido do link.
# 3. TRES CAMADAS DE GUARDA, e a terceira e a que realmente importa.
#
# ---------------------------------------------------------------------------
# POR QUE TRES CAMADAS, E NAO SO O ARQUIVO DE VINCULO
# ---------------------------------------------------------------------------
# Achado desta sessao (03/08/2026), medido e nao suposto: a CLI REESCREVE
# `supabase/.temp/project-ref` sozinha, no meio de um lote, a partir do estado
# do servidor — e o servidor marca a PRODUCAO como `linked: true`. Foi
# observado: o arquivo virou `plnbgdabciwygsmnyddy` entre a terceira e a quarta
# consulta de um backup, junto com `gotrue-version`, `rest-version` e
# `pooler-url`, todos reescritos no mesmo segundo. A guarda de arquivo abortou
# o lote — funcionou —, mas isso prova que o vinculo e ESTADO MUTAVEL alheio, e
# `--linked` sozinho nao e alvo confiavel. `db query` nao aceita
# `--project-ref`, entao nomear o alvo no comando nao e opcao.
#
# Camadas:
#   1. REPARO  - antes de cada chamada, forca o vinculo PARA o alvo autorizado.
#                So aponta para a homologacao; nunca para longe dela.
#   2. GUARDA  - Assert-AlvoSimulacao confere de forma independente e ABORTA se
#                o vinculo ainda nao for o autorizado (o reparo pode falhar).
#   3. MARCADOR - para ESCRITA, o proprio SQL comeca exigindo a chave
#                `simulation_lab_run_id` em `public.system_settings`. Ela existe
#                somente na homologacao. Se a consulta chegar ao banco errado, e
#                o BANCO que recusa, dentro da mesma transacao, antes de
#                qualquer efeito. Esta camada nao depende da CLI, do arquivo de
#                vinculo nem deste script.
#
# Armadilhas ja pagas, preservadas de proposito:
#   - SQL precisa estar achatado em UMA linha (parsing de argumentos da CLI);
#   - comentario '--' quebra o achatamento; use /* */;
#   - NUNCA redirecionar stderr: a CLI escreve 'Initialising login role...' nele
#     e, em PS 5.1, o merge vira ErrorRecord e corta o pipeline no meio do stdout.
# =============================================================================

param(
  [Parameter(Mandatory = $true)][string]$Sql,
  [string]$OutFile = $null,
  [switch]$Raw,
  # SO para o tiro de bootstrap, que planta o marcador num banco que ainda nao o
  # tem. Qualquer outro uso reabre a janela de corrida descrita abaixo.
  [switch]$SemMarcador,
  # Envia o SQL por ARQUIVO (`--file`) em vez de argumento. OBRIGATORIO sempre
  # que o SQL contiver aspas duplas: `npx.ps1` remonta os argumentos e passa por
  # `Invoke-Expression`, que ENGOLE as aspas duplas — um literal JSON como
  # '{"provider":"email"}' chega ao banco como '{provider:email}' e morre com
  # `22P02 invalid input syntax for type json`. Medido em 03/08/2026.
  [switch]$ViaArquivo
)

. (Join-Path $PSScriptRoot 'Guard-Ambiente.ps1')

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$REF = 'qjvpkaurihjvzktlinhp'

# --- Camada 1: reparo do vinculo, sempre NA DIRECAO do alvo autorizado -------
$vinculado = Get-RefVinculado
if ($vinculado -ne $REF) {
  Write-GuardaLog "vinculo estava em '$vinculado'; reapontando para o alvo autorizado"
  Push-Location $repo
  try { $null = (& npx --no-install supabase link --project-ref $REF --yes) | Out-String }
  finally { Pop-Location }
}

# --- Camada 2: guarda independente, que ABORTA ------------------------------
Assert-AlvoSimulacao -ProjectRef $REF -Carga $Sql -Operacao 'db query' | Out-Null

# --- Camada 3: o banco recusa se nao for o laboratorio ----------------------
# VALE PARA LEITURA TAMBEM, e isso foi aprendido do jeito caro (03/08/2026).
#
# As camadas 1 e 2 conferem um ARQUIVO; a CLI resolve o alvo DEPOIS. Entre uma
# coisa e outra existe uma janela, e ela nao e teorica: durante o primeiro
# backup a guarda autorizou a consulta de `public.units`, a CLI reapontou para a
# producao no meio da execucao, e a consulta VOLTOU COM AS UNIDADES REAIS DE
# PRODUCAO (PR CAPITAL, PR INTERIOR, SANTA CATARINA) em vez das duas unidades
# sinteticas da homologacao. Foi LEITURA, nao escrita, e nada foi alterado em
# producao — mas contaminou o arquivo de backup com dado real, que teve de ser
# destruido.
#
# A licao: guarda que confere estado FORA da consulta nao fecha corrida. O
# marcador viaja no MESMO lote enviado ao banco, entao a pergunta "sou o
# laboratorio?" e respondida pelo mesmo servidor que responderia a consulta. Se
# o lote cair no banco errado, ele morre ali, e nenhuma linha real volta.
$prefixo = ''
if (-not $SemMarcador) {
  $prefixo = "do `$SIMG`$ begin if not exists (select 1 from public.system_settings where key = 'simulation_lab_run_id') then raise exception 'ALVO ERRADO: este banco nao tem o marcador do laboratorio de simulacao; consulta recusada'; end if; end `$SIMG`$; "
}

$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
Push-Location $repo
try {
  if ($ViaArquivo) {
    # Arquivo temporario FORA do repositorio, apagado no `finally` aconteca o
    # que acontecer — nada com segredo sobrevive a chamada.
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('simsql-' + [guid]::NewGuid().ToString('N') + '.sql')
    try {
      [IO.File]::WriteAllText($tmp, ($prefixo + "`n" + $Sql), (New-Object Text.UTF8Encoding($false)))
      $out = (& npx --no-install supabase db query --file "$tmp" --linked) | Out-String
    } finally {
      if (Test-Path $tmp) { Remove-Item $tmp -Force }
    }
  } else {
    $flat = (($prefixo + $Sql) -replace '\r?\n', ' ') -replace '\s+', ' '
    if ($flat -match '(^|\s)--') { throw "SQL contem comentario '--'; use /* */ ou remova." }
    if ($flat -match '"') { throw 'SQL contem aspas duplas: use -ViaArquivo (npx.ps1 as engole).' }
    $out = (& npx --no-install supabase db query "$flat" --linked) | Out-String
  }
}
finally {
  Pop-Location
  $ErrorActionPreference = $prev
}

$i = $out.IndexOf('{')
if ($i -lt 0) { throw "Sem JSON na resposta da CLI. Saida bruta:`n$out" }
$json = $out.Substring($i).Trim()

if ($Raw) {
  if ($OutFile) { $json | Out-File -Encoding utf8 $OutFile }
  return $json
}

$parsed = $json | ConvertFrom-Json
if ($parsed.PSObject.Properties.Name -contains '_tag' -and $parsed._tag -eq 'Error') {
  throw "ERRO SQL: $($parsed.error.message)"
}
if ($OutFile) {
  ($parsed.rows | ConvertTo-Json -Depth 12) | Out-File -Encoding utf8 $OutFile
}
return $parsed.rows
