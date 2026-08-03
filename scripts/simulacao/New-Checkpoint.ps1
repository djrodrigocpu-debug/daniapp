# =============================================================================
# AAPEx 1.3.5 - Laboratorio de Simulacao - CHECKPOINT FORA DO GIT
# =============================================================================
# Retrato completo do estado FINAL da simulacao, para que qualquer limpeza
# futura seja auditavel contra ele. Nao contem senha nem segredo: mapeia
# identidades sinteticas por e-mail e papel, nunca por credencial.
# =============================================================================

param(
  [Parameter(Mandatory)][string]$Destino,
  [string]$RelatorioSemanas,
  [string]$RelatorioMensais
)

$ErrorActionPreference = 'Stop'
$q = Join-Path $PSScriptRoot 'Invoke-SimSql.ps1'
New-Item -ItemType Directory -Force -Path $Destino | Out-Null

function Dump { param([string]$Nome, [string]$Sql)
  $r = & $q -Sql "select jsonb_agg(t) as rows from ($Sql) t" -Raw
  $bruto = ($r | ConvertFrom-Json).rows
  $linhas = if ($bruto -and $bruto.Count -gt 0) { $bruto[0].rows } else { $null }
  if ($null -eq $linhas) { '[]' | Out-File -Encoding utf8 (Join-Path $Destino "$Nome.json") }
  else { ($linhas | ConvertTo-Json -Depth 20) | Out-File -Encoding utf8 (Join-Path $Destino "$Nome.json") }
  $n = if ($null -eq $linhas) { 0 } elseif ($linhas -is [array]) { $linhas.Count } else { 1 }
  Write-Host ("  {0,-34} {1,6}" -f $Nome, $n)
}

Write-Host '== Contagens por tabela =='
Dump 'contagens-por-tabela' "select c.relname as tabela, (xpath('/row/cnt/text()', query_to_xml(format('select count(*) as cnt from public.%I', c.relname), false, true, '')))[1]::text::bigint as linhas from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname"

Write-Host '== Identidades sinteticas (sem senha) =='
Dump 'usuarios-sinteticos' "select u.display_name, u.corporate_email, s.role, u.status from public.users u left join public.user_scopes s on s.user_id=u.id order by s.role, u.corporate_email"

Write-Host '== Mapa de atribuicoes =='
Dump 'mapa-assignments' "select us.corporate_email as gc, o.partner_name, un.name as unidade, co.name as coordenadoria from public.operation_assignments a join public.users us on us.id=a.user_id join public.operations o on o.id=a.operation_id join public.units un on un.id=o.unit_id left join public.coordinations co on co.id=o.coordination_id where a.active order by us.corporate_email, o.partner_name"

Write-Host '== Oito semanas por parceiro =='
Dump 'semanas-por-parceiro' "select o.partner_name, count(*) as ciclos, count(*) filter (where c.status='closed') as fechados, count(*) filter (where c.status='draft') as rascunho, min(c.week_start_date)::text as primeira, max(c.week_start_date)::text as ultima from public.assisted_cycles c join public.operations o on o.id=c.operation_id group by o.partner_name order by o.partner_name"

Write-Host '== Medicoes por status =='
Dump 'medicoes-por-status' "select e.status::text as status, count(*) as n from public.assisted_cycle_entries e group by e.status order by n desc"

Write-Host '== Auditorias mensais por parceiro =='
Dump 'auditorias-por-parceiro' "select o.partner_name, count(*) as auditorias, count(*) filter (where ev.status='approved') as aprovadas, string_agg(to_char(ev.period_start,'YYYY-MM'), ', ' order by ev.period_start) as competencias from public.evaluations ev join public.operations o on o.id=ev.operation_id where ev.evaluation_model='monthly_criteria' group by o.partner_name order by o.partner_name"

Write-Host '== Snapshots, planos, evidencias, trilha =='
Dump 'snapshots' "select s.id, o.partner_name, s.score, s.created_at from public.official_snapshots s join public.evaluations ev on ev.id=s.evaluation_id join public.operations o on o.id=ev.operation_id order by o.partner_name"
Dump 'planos' "select p.source::text as origem, p.status::text as status, count(*) as n from public.action_plans p group by p.source, p.status order by 1,2"
Dump 'evidencias' "select f.path, f.bucket, f.mime_type, f.size_bytes, f.status::text as status, f.created_at from public.evidence_files f order by f.created_at"
Dump 'trilha-por-evento' "select event, result, count(*) as n from public.audit_logs group by event, result order by n desc"
Dump 'trilha-por-ator' "select coalesce(us.corporate_email, '(sistema)') as ator, count(*) as eventos from public.audit_logs l left join public.users us on us.id=l.actor_user_id group by 1 order by 2 desc"
Dump 'catalogo-regional' "select d.code, cv.target, cv.tolerance, cv.weight, cv.include_in_assisted_management as assistida, cv.include_in_monthly_audit as mensal, cv.status::text as status from public.indicator_regional_config_versions cv join public.indicator_regional_configs rc on rc.id=cv.config_id join public.indicator_definitions d on d.id=rc.indicator_definition_id order by d.code"
Dump 'criterios-sinteticos' "select cr.code, crv.question, crv.evidence_required, crv.allows_na, crv.status::text as status from public.audit_criteria cr join public.audit_criteria_versions crv on crv.criterion_id=cr.id order by cr.code"
Dump 'migrations' "select version from supabase_migrations.schema_migrations order by version"

foreach ($r in @($RelatorioSemanas, $RelatorioMensais)) {
  if ($r -and (Test-Path $r)) { Copy-Item $r $Destino -Force; Write-Host ("  copiado: " + [IO.Path]::GetFileName($r)) }
}

Write-Host '== SHA-256 e releitura do disco =='
# O proprio SHA256SUMS.txt fica FORA do manifesto: numa reexecucao ele seria
# lido antes de ser reescrito, e o hash antigo nunca bateria com o novo conteudo.
# `-Exclude` com `-File` sobre um diretorio sem curinga NAO filtra no PS 5.1 —
# devolveu zero arquivo em vez de "todos menos um". Filtrar explicitamente.
$hashes = Get-ChildItem $Destino -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' } | Sort-Object Name | ForEach-Object {
  $h = Get-FileHash $_.FullName -Algorithm SHA256
  "{0}  {1}  {2}" -f $h.Hash, $_.Length, $_.Name
}
$hashes | Out-File -Encoding utf8 (Join-Path $Destino 'SHA256SUMS.txt')
$ok = 0
foreach ($l in $hashes) { $p = $l -split '\s+',3
  if ((Get-FileHash (Join-Path $Destino $p[2]) -Algorithm SHA256).Hash -eq $p[0]) { $ok++ } }
Write-Host ("  arquivos: {0} | reconferidos do disco: {1}" -f $hashes.Count, $ok)
Write-Host ''
Write-Host "CHECKPOINT em $Destino"
