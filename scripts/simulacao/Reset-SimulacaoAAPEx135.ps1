# =============================================================================
# RESETAR_SIMULACAO_AAPEX_135
# =============================================================================
# Procedimento UNICO e reexecutavel de reset do laboratorio. Roda SOMENTE na
# homologacao `qjvpkaurihjvzktlinhp`, e as tres camadas de Invoke-SimSql.ps1
# valem para cada instrucao: reparo de vinculo, guarda de arquivo e marcador
# dentro do proprio SQL.
#
# ---------------------------------------------------------------------------
# POR QUE ESTE PROCEDIMENTO EXISTE, EM VEZ DA RPC DE EXPURGO
# ---------------------------------------------------------------------------
# `admin_purge_legacy_evaluations` (0052) RECUSA quando ha avaliacao fora de
# rascunho, snapshot oficial, validacao ou evidencia — e recusa CERTO: em
# producao isso protege dado real. A fixture da Fase 11 tem exatamente essas
# coisas (2 auditorias aprovadas, 2 snapshots, 2 validacoes), entao a RPC nao
# serve para limpa-la. Usar a RPC aqui seria pedir que ela falhasse.
#
# ---------------------------------------------------------------------------
# O QUE ESTE PROCEDIMENTO ADMITE FAZER, E DECLARA
# ---------------------------------------------------------------------------
# Ele DESLIGA os gatilhos (`session_replication_role = replica`) durante a
# transacao de limpeza. Isso contorna as guardas de imutabilidade de snapshot e
# de auditoria aprovada. E' deliberado e esta escrito aqui em vez de escondido:
#
#   · nao e caminho de aplicativo e nunca sera oferecido a um usuario;
#   · so existe porque este banco e um LABORATORIO descartavel;
#   · a fixture que ele apaga esta salva em backup logico verificado, com
#     SHA-256 reconferido do disco e copia espelho;
#   · em producao este script aborta antes da primeira instrucao, pelo marcador.
#
# Nao ha equivalente disso no produto, e nao deve haver.
#
# ---------------------------------------------------------------------------
# O QUE E PRESERVADO
# ---------------------------------------------------------------------------
#   · migrations (0001-0053) — nenhuma e tocada;
#   · os 12 indicadores canonicos de 0021 e suas versoes (conteudo de migration);
#   · `system_settings`: o marcador do laboratorio e a chave de cutover;
#   · Storage: buckets e objetos sinteticos existentes (§4.8 manda preservar).
# =============================================================================

param(
  [switch]$Confirmar,
  [string]$Confirmacao = ''
)

$ErrorActionPreference = 'Stop'
$q = Join-Path $PSScriptRoot 'Invoke-SimSql.ps1'

# Codigos canonicos de 0021: nascem por migration e NAO sao dado de simulacao.
$CANONICOS = "('IND-001','IND-002','IND-003','IND-004','IND-005','IND-006','IND-007','IND-008','IND-009','IND-010','IND-011','IND-012')"

# Ordem irrelevante: a limpeza roda com gatilhos e FKs desligados na transacao.
$TABELAS = @(
  'evaluation_criterion_answer_evidence','evaluation_criterion_answers','evaluation_criteria',
  'evaluation_answer_evidence','evaluation_answers','official_snapshots','validations','diagnoses',
  'action_plans','assisted_cycle_entries','assisted_cycles','evidence_files',
  'evidence_upload_reservations','indicator_results','measurements','evaluations',
  'visit_reports','visits','visit_rules','best_practices','calendar_exceptions','sync_operations',
  'audit_items','audit_template_versions','audit_templates',
  'audit_criteria_versions','audit_criteria',
  'indicator_regional_config_versions','indicator_regional_configs',
  'theme_versions','themes','region_weightings',
  'operation_assignments','operations','coordinations','units','regions',
  'user_scopes','users','audit_logs','organizations'
)

Write-Host '============================================================'
Write-Host ' RESETAR_SIMULACAO_AAPEX_135'
Write-Host '============================================================'

# --- Contagens ANTES, para o operador ver o que sera removido ---------------
$sel = ($TABELAS | ForEach-Object { "(select count(*) from public.$_) as $_" }) -join ', '
$antes = & $q -Sql "select $sel, (select count(*) from auth.users) as auth_users, (select count(*) from public.indicator_definitions where code not in $CANONICOS) as indicadores_nao_canonicos"
Write-Host ''
Write-Host 'SERA REMOVIDO (contagem atual):'
$total = 0
foreach ($p in $antes.PSObject.Properties) {
  if ([int]$p.Value -gt 0) { Write-Host ("  {0,-45} {1,6}" -f $p.Name, $p.Value); $total += [int]$p.Value }
}
Write-Host ("  {0,-45} {1,6}" -f 'TOTAL DE LINHAS', $total)

$preservado = & $q -Sql "select (select count(*) from public.indicator_definitions where code in $CANONICOS) as indicadores_canonicos, (select count(*) from supabase_migrations.schema_migrations) as migrations, (select count(*) from storage.objects) as storage_objetos, (select count(*) from public.system_settings) as system_settings"
Write-Host ''
Write-Host 'SERA PRESERVADO:'
foreach ($p in $preservado.PSObject.Properties) { Write-Host ("  {0,-45} {1,6}" -f $p.Name, $p.Value) }

if (-not $Confirmar) {
  Write-Host ''
  Write-Host 'MODO DRY-RUN. Nada foi alterado.'
  Write-Host 'Para executar: -Confirmar -Confirmacao "RESETAR SIMULACAO"'
  return
}

if ($Confirmacao -ne 'RESETAR SIMULACAO') {
  throw "Confirmacao literal ausente. Esperado exatamente: RESETAR SIMULACAO"
}

Write-Host ''
Write-Host 'Executando limpeza...'

$deletes = ($TABELAS | ForEach-Object { "delete from public.$_;" }) -join ' '
$sql = @"
begin;
set local session_replication_role = 'replica';
$deletes
delete from public.indicator_versions where definition_id in (select id from public.indicator_definitions where code not in $CANONICOS);
delete from public.indicator_definitions where code not in $CANONICOS;
delete from app.user_password_onboarding;
delete from auth.identities;
delete from auth.users;
set local session_replication_role = 'origin';
commit;
select 'limpo' as estado;
"@
$null = & $q -Sql $sql

$depois = & $q -Sql "select $sel, (select count(*) from auth.users) as auth_users, (select count(*) from public.indicator_definitions) as indicator_definitions, (select count(*) from supabase_migrations.schema_migrations) as migrations, (select count(*) from storage.objects) as storage_objetos, (select count(*) from public.system_settings) as system_settings"
Write-Host ''
Write-Host 'DEPOIS:'
$resid = 0
foreach ($p in $depois.PSObject.Properties) {
  Write-Host ("  {0,-45} {1,6}" -f $p.Name, $p.Value)
  if ($p.Name -notin @('migrations','storage_objetos','system_settings','indicator_definitions')) { $resid += [int]$p.Value }
}
if ($resid -ne 0) { throw "RESET INCOMPLETO: restaram $resid linhas operacionais." }
if ([int]$depois.migrations -ne 53) { throw "MIGRATIONS ALTERADAS: $($depois.migrations)" }
if ([int]$depois.indicator_definitions -ne 12) { throw "Indicadores canonicos deveriam ser 12; sao $($depois.indicator_definitions)" }

Write-Host ''
Write-Host 'RESET CONCLUIDO. Migrations, indicadores canonicos, marcador e Storage preservados.'
