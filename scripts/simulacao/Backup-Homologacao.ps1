# =============================================================================
# AAPEx 1.3.5 - Laboratorio de Simulacao - BACKUP LOGICO DA HOMOLOGACAO
# =============================================================================
# Salva a fixture da Fase 11 ANTES de qualquer limpeza. Esta maquina nao roda
# Docker, entao `supabase db dump` nao existe aqui: o caminho que funciona e o
# EXPORT LOGICO por tabela, em JSON, com SHA-256 e releitura do disco.
#
# O backup e escrito FORA do repositorio. Nada aqui entra no Git.
# =============================================================================

param(
  [Parameter(Mandatory = $true)][string]$Destino,
  [string]$Espelho = $null
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Guard-Ambiente.ps1')

$REF = 'qjvpkaurihjvzktlinhp'
Repair-VinculoSimulacao
Assert-AlvoSimulacao -ProjectRef $REF -Operacao 'backup logico (leitura)' | Out-Null

$q = Join-Path $PSScriptRoot 'Invoke-SimSql.ps1'
New-Item -ItemType Directory -Force -Path $Destino | Out-Null

function Export-Consulta {
  param([string]$Nome, [string]$Sql)
  $destino = Join-Path $Destino "$Nome.json"
  $bruto = & $q -Sql $Sql -Raw
  $linhas = ($bruto | ConvertFrom-Json).rows[0].rows
  if ($null -eq $linhas) { '[]' | Out-File -Encoding utf8 $destino }
  else { ($linhas | ConvertTo-Json -Depth 25) | Out-File -Encoding utf8 $destino }
  $n = if ($null -eq $linhas) { 0 } elseif ($linhas -is [array]) { $linhas.Count } else { 1 }
  Write-Host ("  {0,-52} {1,6} linhas" -f $Nome, $n)
  return $n
}

Write-Host "== Tabelas de public =="
$tabelas = (& $q -Sql "select jsonb_agg(t) as rows from (select c.relname as n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relkind='r' order by c.relname) t" -Raw | ConvertFrom-Json).rows[0].rows

$contagens = @{}
foreach ($t in $tabelas) {
  $nome = $t.n
  $contagens[$nome] = Export-Consulta -Nome "dados_public_$nome" -Sql "select jsonb_agg(x) as rows from public.$nome x"
}

Write-Host "== Identidades (projeto sintetico de homologacao) =="
$contagens['auth.users'] = Export-Consulta -Nome 'auth_usuarios' -Sql "select jsonb_agg(x) as rows from (select id, email, encrypted_password, email_confirmed_at, created_at, updated_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, role, aud, banned_until, deleted_at from auth.users order by created_at) x"
$contagens['auth.identities'] = Export-Consulta -Nome 'auth_identidades' -Sql "select jsonb_agg(x) as rows from (select id, user_id, provider, provider_id, identity_data, created_at, updated_at from auth.identities order by created_at) x"

Write-Host "== Schema app =="
$appBruto = (& $q -Sql "select jsonb_agg(t) as rows from (select c.relname as n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='app' and c.relkind='r' order by c.relname) t" -Raw | ConvertFrom-Json).rows
$appTabelas = if ($appBruto -and $appBruto.Count -gt 0) { $appBruto[0].rows } else { $null }
if ($appTabelas) {
  foreach ($t in $appTabelas) {
    $contagens["app.$($t.n)"] = Export-Consulta -Nome "dados_app_$($t.n)" -Sql "select jsonb_agg(x) as rows from app.$($t.n) x"
  }
}

Write-Host "== Storage (preservar evidencias sinteticas existentes) =="
$contagens['storage.buckets'] = Export-Consulta -Nome 'storage_buckets' -Sql "select jsonb_agg(x) as rows from storage.buckets x"
$contagens['storage.objects'] = Export-Consulta -Nome 'storage_objetos' -Sql "select jsonb_agg(x) as rows from (select id, bucket_id, name, owner, created_at, updated_at, last_accessed_at, metadata from storage.objects order by created_at) x"

Write-Host "== Catalogo estrutural =="
Export-Consulta -Nome 'migrations' -Sql "select jsonb_agg(x order by x.version) as rows from (select version from supabase_migrations.schema_migrations) x" | Out-Null
Export-Consulta -Nome 'schema_colunas' -Sql "select jsonb_agg(x) as rows from (select table_schema, table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema in ('public','app') order by table_schema, table_name, ordinal_position) x" | Out-Null
Export-Consulta -Nome 'policies' -Sql "select jsonb_agg(x) as rows from (select schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check from pg_policies where schemaname in ('public','app','storage') order by schemaname, tablename, policyname) x" | Out-Null
Export-Consulta -Nome 'funcoes' -Sql "select jsonb_agg(x) as rows from (select n.nspname as esquema, p.proname as nome, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app') order by 1,2,3) x" | Out-Null
Export-Consulta -Nome 'triggers' -Sql "select jsonb_agg(x) as rows from (select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation from information_schema.triggers where event_object_schema in ('public','app') order by 1,2,3,5) x" | Out-Null
Export-Consulta -Nome 'tipos_enum' -Sql "select jsonb_agg(x) as rows from (select n.nspname as esquema, t.typname as tipo, e.enumlabel as valor, e.enumsortorder from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace order by 1,2,4) x" | Out-Null

($contagens.GetEnumerator() | Sort-Object Name | ForEach-Object { [pscustomobject]@{ tabela = $_.Key; linhas = $_.Value } } | ConvertTo-Json -Depth 5) |
  Out-File -Encoding utf8 (Join-Path $Destino 'contagens.json')

Write-Host "== SHA-256 e releitura do disco =="
$hashes = Get-ChildItem $Destino -File | Sort-Object Name | ForEach-Object {
  $h = Get-FileHash $_.FullName -Algorithm SHA256
  "{0}  {1}  {2}" -f $h.Hash, $_.Length, $_.Name
}
$hashes | Out-File -Encoding utf8 (Join-Path $Destino 'SHA256SUMS.txt')

$conferidos = 0; $divergentes = @()
foreach ($linha in $hashes) {
  $p = $linha -split '\s+', 3
  $arq = Join-Path $Destino $p[2]
  if ((Get-FileHash $arq -Algorithm SHA256).Hash -eq $p[0]) { $conferidos++ } else { $divergentes += $p[2] }
}
Write-Host ("  arquivos: {0} | reconferidos do disco: {1} | divergentes: {2}" -f $hashes.Count, $conferidos, $divergentes.Count)
if ($divergentes.Count -gt 0) { throw "BACKUP INCONSISTENTE: $($divergentes -join ', ')" }

if ($Espelho) {
  Write-Host "== Segunda copia verificada =="
  New-Item -ItemType Directory -Force -Path $Espelho | Out-Null
  Copy-Item (Join-Path $Destino '*') $Espelho -Force
  $iguais = 0; $difs = @()
  foreach ($linha in $hashes) {
    $p = $linha -split '\s+', 3
    $arq = Join-Path $Espelho $p[2]
    if ((Test-Path $arq) -and (Get-FileHash $arq -Algorithm SHA256).Hash -eq $p[0]) { $iguais++ } else { $difs += $p[2] }
  }
  Write-Host ("  espelho: {0}/{1} conferem" -f $iguais, $hashes.Count)
  if ($difs.Count -gt 0) { throw "ESPELHO INCONSISTENTE: $($difs -join ', ')" }
}

Write-Host ''
Write-Host "BACKUP CONCLUIDO em $Destino"
