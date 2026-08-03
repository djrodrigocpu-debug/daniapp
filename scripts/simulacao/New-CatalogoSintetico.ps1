# =============================================================================
# AAPEx 1.3.5 - Laboratorio de Simulacao - CATALOGO REGIONAL SINTETICO
# =============================================================================
# Tudo pelo ADMINISTRADOR sintetico autenticado, pelas RPCs `catalog_*` reais.
#
# ORDEM OBRIGATORIA (armadilha ja paga na Fase 11):
#   1. rascunho da configuracao regional
#   2. criar e PUBLICAR os criterios daquela configuracao
#   3. so entao publicar a versao da configuracao com `includeInMonthlyAudit`
# Publicar antes falha com "auditoria mensal exige ao menos um criterio
# publicado e ativo para este indicador na regiao".
#
# Os 12 indicadores canonicos vem da migration 0021 e NAO sao dado de simulacao:
# a configuracao regional espelha meta/tolerancia/peso do catalogo vigente, que
# e exatamente o que o backfill de producao fez. O 13o e sintetico e nasce aqui
# pelo mesmo caminho que a interface de Admin usa.
# =============================================================================

param([Parameter(Mandatory)][string]$ArquivoCredenciais)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'SimApp.ps1')
$FIX = & (Join-Path $PSScriptRoot 'Fixture-Definicao.ps1')
$q = Join-Path $PSScriptRoot 'Invoke-SimSql.ps1'

$cred = Get-Content $ArquivoCredenciais -Raw | ConvertFrom-Json
$sAdmin = Connect-SimUser -Email $cred.admin.Email -Senha $cred.admin.Senha
Write-Host ('Administrador autenticado: ' + $sAdmin.Email)

$reg = & $q -Sql "select id from public.regions where name = '$($FIX.Regiao)'"
$regionId = $reg.id
Write-Host ("Regiao $($FIX.Regiao): $regionId")

# --- 1. TEMA ---------------------------------------------------------------
Write-Host '== Tema global sintetico =='
# Idempotente: o script precisa poder ser reexecutado sem exigir reset.
$temaJa = & $q -Sql "select count(*) as n from public.themes where code='TEMA-SIM'"
if ([int]$temaJa.n -eq 0) {
  $null = Invoke-SimRpc -Sessao $sAdmin -Nome 'catalog_create_theme' -Carga @{
    p_scope = 'global'; p_region_id = $null; p_code = 'TEMA-SIM'
    p_payload = @{ name = 'TEMA SINTETICO DE SIMULACAO'; sortOrder = 1 } }
}
$tv = & $q -Sql "select tv.id, tv.status from public.theme_versions tv join public.themes t on t.id=tv.theme_id where t.code='TEMA-SIM' order by tv.version_number desc limit 1"
if ($tv.status -ne 'published') {
  $null = Invoke-SimRpc -Sessao $sAdmin -Nome 'catalog_publish_theme_version' -Carga @{ p_version_id = $tv.id }
}
$themeVersionId = $tv.id
Write-Host ("  tema publicado, versao $themeVersionId")

# --- 2. O 13o INDICADOR, sintetico ------------------------------------------
Write-Host '== 13o indicador (sintetico, pelo caminho real do catalogo) =='
$i13 = $FIX.Indicador13
$existe = & $q -Sql "select count(*) as n from public.indicator_definitions where code = '$($i13.Codigo)'"
if ([int]$existe.n -eq 0) {
  $null = Invoke-SimRpc -Sessao $sAdmin -Nome 'catalog_create_indicator' -Carga @{
    p_scope = 'global'; p_region_id = $null; p_code = $i13.Codigo
    p_payload = @{ name = $i13.Nome; unit = $i13.Unidade; direction = $i13.Direcao
                   description = 'Indicador criado exclusivamente para o laboratorio de simulacao.' } }
}
$iv13 = & $q -Sql "select iv.id, iv.status from public.indicator_versions iv join public.indicator_definitions d on d.id=iv.definition_id where d.code='$($i13.Codigo)' order by iv.version_number desc limit 1"
if ($iv13.status -ne 'published') {
  $null = Invoke-SimRpc -Sessao $sAdmin -Nome 'catalog_publish_indicator_version' -Carga @{ p_version_id = $iv13.id }
}
Write-Host ("  $($i13.Codigo) publicado")

# --- 3. AS 13 CONFIGURACOES REGIONAIS ---------------------------------------
Write-Host '== 13 configuracoes regionais (rascunho -> criterios -> publicacao) =='
$inds = & $q -Sql "select d.id as definition_id, d.code, iv.id as version_id, iv.target, iv.yellow_tolerance, iv.weight from public.indicator_definitions d join public.indicator_versions iv on iv.definition_id=d.id and iv.status='published' order by d.code"

$ordem = 0
foreach ($ind in $inds) {
  $ordem++
  # Meta, tolerancia e peso vivem na CONFIGURACAO REGIONAL, nao na versao do
  # indicador. Os 12 canonicos ja trazem os valores do catalogo vigente na sua
  # versao (foi de la que o backfill de producao os copiou), mas o indicador
  # criado agora nasce com zeros — e meta 0 com tolerancia 0 tornaria TODA
  # medicao conforme, apagando o cenario. Para ele os valores vem da fixture.
  $meta = [double]$ind.target; $tol = [double]$ind.yellow_tolerance; $peso = [double]$ind.weight
  if ($ind.code -eq $FIX.Indicador13.Codigo) {
    $meta = [double]$FIX.Indicador13.Meta
    $tol  = [double]$FIX.Indicador13.Tolerancia
    $peso = [double]$FIX.Indicador13.Peso
  }
  # 3a) rascunho da configuracao, ja declarando que entra nos DOIS modulos
  $null = Invoke-SimRpc -Sessao $sAdmin -Nome 'catalog_save_regional_config_draft' -Carga @{
    p_region_id = $regionId; p_indicator_id = $ind.definition_id
    p_payload = @{ indicatorVersionId = $ind.version_id; themeVersionId = $themeVersionId
                   sortOrder = $ordem
                   target = $meta; tolerance = $tol; weight = $peso
                   active = $true; includeInAssistedManagement = $true; includeInMonthlyAudit = $true } }

  $cfg = & $q -Sql "select rc.id as config_id, cv.id as version_id from public.indicator_regional_configs rc join public.indicator_regional_config_versions cv on cv.config_id=rc.id where rc.region_id='$regionId' and rc.indicator_definition_id='$($ind.definition_id)' order by cv.version_number desc limit 1"

  # 3b) DOIS criterios sinteticos por indicador, marcados como tal.
  #     O primeiro do primeiro indicador exige EVIDENCIA; o segundo de todos
  #     admite N/A com justificativa. Assim a auditoria exercita evidencia
  #     obrigatoria, N/A permitido e N/A proibido, sem inflar o volume.
  $criterios = @(
    @{ Sufixo='A'; Questao = "[SIMULACAO] O processo do indicador $($ind.code) foi executado conforme o padrao no mes?"
       Evidencia = ($ordem -eq 1); Na = $false; Just = $false; Ordem = 1 }
    @{ Sufixo='B'; Questao = "[SIMULACAO] Ha registro de tratativa para desvios do indicador $($ind.code)?"
       Evidencia = $false; Na = $true; Just = $true; Ordem = 2 }
  )
  foreach ($c in $criterios) {
    $codigo = "CRIT-SIM-$($ind.code)-$($c.Sufixo)"
    $ja = & $q -Sql "select count(*) as n from public.audit_criteria where code = '$codigo'"
    if ([int]$ja.n -eq 0) {
      $null = Invoke-SimRpc -Sessao $sAdmin -Nome 'catalog_create_criterion' -Carga @{
        p_config_id = $cfg.config_id; p_code = $codigo
        p_payload = @{ question = $c.Questao
                       description = $FIX.AvisoCriterio
                       guidance = $FIX.AvisoCriterio
                       sortOrder = $c.Ordem; required = $true
                       evidenceRequired = $c.Evidencia; allowsNa = $c.Na; requiresJustification = $c.Just } }
    }
    $crv = & $q -Sql "select crv.id, crv.status from public.audit_criteria_versions crv join public.audit_criteria cr on cr.id=crv.criterion_id where cr.code='$codigo' order by crv.version_number desc limit 1"
    if ($crv.status -ne 'published') {
      $null = Invoke-SimRpc -Sessao $sAdmin -Nome 'catalog_publish_criterion_version' -Carga @{ p_version_id = $crv.id }
    }
  }

  # 3c) so agora a configuracao pode ser publicada com auditoria mensal ligada
  $null = Invoke-SimRpc -Sessao $sAdmin -Nome 'catalog_publish_regional_config_version' -Carga @{ p_version_id = $cfg.version_id }
  Write-Host ("  {0,-12} config publicada (meta={1} tol={2} peso={3}) + 2 criterios" -f $ind.code, $meta, $tol, $peso)
}

# --- 4. PONDERACAO REGIONAL SINTETICA ---------------------------------------
# Pesos DELIBERADAMENTE desiguais: com 50/50 a media ponderada e a aritmetica
# coincidem e o cenario passaria sem provar a A-11 (licao L-07 da Fase 11).
Write-Host '== Ponderacao regional sintetica (60/40) =='
$null = Invoke-SimRpc -Sessao $sAdmin -Nome 'catalog_save_region_weighting_draft' -Carga @{
  p_region_id = $regionId
  # Chaves do contrato da 0048: `assistedWeight` / `auditWeight`. Nomear de outro
  # jeito devolve "informe os dois pesos: desempenho e processo".
  p_input = @{ assistedWeight = 60; auditWeight = 40
               notes = 'PONDERACAO SINTETICA DE SIMULACAO - SEM APROVACAO EMPRESARIAL PARA PRODUCAO' } }
$rw = & $q -Sql "select id, status from public.region_weightings where region_id='$regionId' order by created_at desc limit 1"
if ($rw.status -ne 'published') {
  $null = Invoke-SimRpc -Sessao $sAdmin -Nome 'catalog_publish_region_weighting' -Carga @{ p_id = $rw.id }
}
Write-Host '  ponderacao publicada'

$fim = & $q -Sql "select (select count(*) from public.indicator_regional_configs) as configs, (select count(*) from public.indicator_regional_config_versions where status='published' and active) as versoes_publicadas, (select count(*) from public.audit_criteria) as criterios, (select count(*) from public.audit_criteria_versions where status='published') as criterios_publicados, (select count(*) from public.region_weightings where status='published') as ponderacoes"
Write-Host ''
Write-Host 'CATALOGO PRONTO:'
$fim.PSObject.Properties | ForEach-Object { Write-Host ("  {0,-28} {1}" -f $_.Name, $_.Value) }


