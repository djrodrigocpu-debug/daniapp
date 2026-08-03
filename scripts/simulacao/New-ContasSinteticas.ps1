# =============================================================================
# AAPEx 1.3.5 - Laboratorio de Simulacao - CONTAS E TOPOLOGIA SINTETICAS
# =============================================================================
# Genese do primeiro administrador pelo procedimento canonico
# (docs/OPERACAO_E_DEPLOY_AAPEX_V2.md §5) e, dali em diante, TUDO pelo caminho
# real do aplicativo: Edge Function de provisionamento, troca de senha de
# primeiro acesso e RPCs administrativas sob RLS.
#
# SENHAS: nascem de RNGCryptoServiceProvider, existem so em memoria e vao para
# UM arquivo fora do Git. Nunca sao impressas, nunca entram em log, nunca vao
# para a conversa nem para o relatorio.
#
# NOMES DE VARIAVEL: o PowerShell NAO distingue maiuscula de minuscula, entao
# `$sim` e `$SIM` sao a MESMA variavel. Chamar um resultado intermediario de
# `$sim` apagou a fixture inteira em silencio e o lote seguinte foi enviado
# vazio. Por isso a fixture aqui se chama `$FIX` e nada mais se parece com ela.
# =============================================================================

param([Parameter(Mandatory)][string]$ArquivoCredenciais)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'SimApp.ps1')
$FIX = & (Join-Path $PSScriptRoot 'Fixture-Definicao.ps1')
$q = Join-Path $PSScriptRoot 'Invoke-SimSql.ps1'

function New-SenhaSintetica {
  $alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; $mini = 'abcdefghijkmnpqrstuvwxyz'
  $dig = '23456789'; $sym = '#%@=+-_.'
  $rng = [Security.Cryptography.RNGCryptoServiceProvider]::new()
  function Pick([string]$s, [int]$n) {
    $b = New-Object byte[] $n; $rng.GetBytes($b)
    -join ($b | ForEach-Object { $s[$_ % $s.Length] })
  }
  $bruto = (Pick $alfa 4) + (Pick $mini 8) + (Pick $dig 4) + (Pick $sym 2)
  $b = New-Object byte[] 18; $rng.GetBytes($b)
  $ordem = 0
  return -join (($bruto.ToCharArray() | Sort-Object { $b[$ordem++] }))
}

function New-CnpjSintetico {
  # O importador EXIGE CNPJ em parceiro novo, e o valida por digito verificador.
  # Base deterministica `3300000000NN`: nao e sequencia repetida (que validadores
  # recusam) e nao colide com faixa real conhecida. Os dois DVs sao calculados,
  # entao o numero passa na validacao sem ser copiado de lugar nenhum.
  param([int]$Seq)
  $base = '3300000000' + ('{0:D2}' -f $Seq)
  function Dv([string]$num) {
    $pesos = if ($num.Length -eq 12) { 5,4,3,2,9,8,7,6,5,4,3,2 } else { 6,5,4,3,2,9,8,7,6,5,4,3,2 }
    $soma = 0
    for ($i = 0; $i -lt $num.Length; $i++) { $soma += [int]::Parse($num[$i]) * $pesos[$i] }
    $r = $soma % 11
    if ($r -lt 2) { return '0' } else { return [string](11 - $r) }
  }
  $d1 = Dv $base
  $d2 = Dv ($base + $d1)
  return $base + $d1 + $d2
}

Write-Host '== Gerando senhas sinteticas =='
$cred = @{}
foreach ($u in $FIX.Usuarios) {
  $cred[$u.Chave] = @{ Email = $u.Email; Nome = $u.Nome; Papel = $u.Papel; Area = $u.Area
                       SenhaInicial = (New-SenhaSintetica); SenhaFinal = (New-SenhaSintetica) }
}
Write-Host ("  $($cred.Count) senhas geradas (nao exibidas)")

# --- 1. GENESE DO ADMINISTRADOR -------------------------------------------
Write-Host '== Genese do administrador sintetico (SQL canonico) =='
$adm = $cred['admin']
$senhaEsc = $adm.SenhaInicial -replace "'", "''"
$sqlGenese = @"
do `$G`$
declare v_id uuid := gen_random_uuid();
begin
  /* Colunas de token precisam ser STRING VAZIA, nunca NULL: o GoTrue as le como
     `string` em Go e devolve 500 no login quando encontra NULL. Medido. */
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    '$($adm.Email)', extensions.crypt('$senhaEsc', extensions.gen_salt('bf')), now(),
    now(), now(),
    jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
    '{}'::jsonb, false,
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  values (gen_random_uuid(), v_id, 'email', v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', '$($adm.Email)', 'email_verified', true), now(), now());
  insert into public.users (id, display_name, corporate_email, status)
  values (v_id, '$($adm.Nome)', '$($adm.Email)', 'active');
  insert into public.user_scopes (user_id, role) values (v_id, 'admin');
end `$G`$;
select id from public.users where corporate_email = '$($adm.Email)';
"@
$g = & $q -Sql $sqlGenese -ViaArquivo
Write-Host ("  administrador criado: " + $g.id)

# --- 2. LOGIN REAL DO ADMINISTRADOR ---------------------------------------
Write-Host '== Login do administrador (GoTrue real) =='
$sAdmin = Connect-SimUser -Email $adm.Email -Senha $adm.SenhaInicial
Write-Host ("  autenticado: " + $sAdmin.UserId)
$cred['admin'].SenhaFinal = $adm.SenhaInicial

# --- 3. ESTRUTURA ORGANIZACIONAL ------------------------------------------
Write-Host '== Estrutura organizacional (admin_bootstrap_organizational_structure) =='
$linhas = @(); $i = 0
foreach ($u in $FIX.Unidades) {
  $i++
  $linhas += @{ index = $i; organization = $FIX.Organizacao; region = $FIX.Regiao
                unit = $u.Unidade; coordination = $u.Coordenadoria; active = $true }
}
$previaEstrutura = Invoke-SimRpc -Sessao $sAdmin -Nome 'admin_bootstrap_organizational_structure' -Carga @{ p_rows = $linhas; p_commit = $false }
Write-Host ('  previa: ' + ($previaEstrutura | ConvertTo-Json -Depth 4 -Compress))
$okEstrutura = Invoke-SimRpc -Sessao $sAdmin -Nome 'admin_bootstrap_organizational_structure' -Carga @{ p_rows = $linhas; p_commit = $true }
Write-Host ('  commit: ' + ($okEstrutura | ConvertTo-Json -Depth 4 -Compress))

# --- 4. PROVISIONAMENTO DAS 16 CONTAS RESTANTES ---------------------------
# `options` vai no CORPO, nao na raiz: na raiz a funcao cai no default e nao
# marca ninguem, em silencio (armadilha ja paga na Fase 11).
Write-Host '== Provisionamento das demais contas (Edge Function real) =='
$rows = @()
foreach ($u in $FIX.Usuarios) {
  if ($u.Chave -eq 'admin') { continue }
  $rows += @{ name = $u.Nome; email = $u.Email; role = $u.Papel; region = $u.Area
              initialPassword = $cred[$u.Chave].SenhaInicial }
}
Write-Host ("  enviando $($rows.Count) registros")
$prov = Invoke-SimEdge -Sessao $sAdmin -Funcao 'admin-provision-users' -Corpo @{
  rows = $rows
  options = @{ requirePasswordChange = $true; resetExistingPasswords = $true }
}
# A Edge Function devolve `state`, NAO `status`. Os estados de sucesso sao
# `created` e `already_exists`; o unico fracasso e `failed`. Ler o campo errado
# fez 16 provisionamentos bem-sucedidos parecerem 16 falhas.
$okc = @($prov.rows | Where-Object { $_.state -ne 'failed' }).Count
Write-Host ("  provisionadas: $okc de $($rows.Count)")
if ($okc -ne $rows.Count) {
  $prov.rows | Where-Object { $_.status -ne 'ok' } | Select-Object -First 6 | ForEach-Object { Write-Host ('  FALHA: ' + ($_ | ConvertTo-Json -Depth 6 -Compress)) }
  throw 'Provisionamento incompleto.'
}

# --- 5. PRIMEIRO ACESSO REAL ----------------------------------------------
Write-Host '== Gate de primeiro acesso (initial-password-change), conta a conta =='
$trocadas = 0
foreach ($u in $FIX.Usuarios) {
  if ($u.Chave -eq 'admin') { continue }
  $c = $cred[$u.Chave]
  $s = Connect-SimUser -Email $c.Email -Senha $c.SenhaInicial
  $st = Invoke-SimRpc -Sessao $s -Nome 'password_change_status'
  $null = Invoke-SimEdge -Sessao $s -Funcao 'initial-password-change' -Corpo @{
    currentPassword = $c.SenhaInicial; newPassword = $c.SenhaFinal }
  $s2 = Connect-SimUser -Email $c.Email -Senha $c.SenhaFinal
  $st2 = Invoke-SimRpc -Sessao $s2 -Nome 'password_change_status'
  $trocadas++
  Write-Host ("  {0,-32} exigia={1} -> exige={2}" -f $c.Email, $st.required, $st2.required)
}
Write-Host ("  contas que passaram pelo gate: $trocadas")

# --- 6. OS 14 PARCEIROS ----------------------------------------------------
Write-Host '== 14 parceiros (admin_import_partners: simular -> confirmar) =='
$prows = @(); $i = 0
foreach ($p in $FIX.Parceiros) {
  $i++
  $un = $FIX.Unidades | Where-Object { $_.Sigla -eq $p.Sigla }
  $coordChave = switch ($p.Sigla) { 'PRC' {'coordPRC'} 'PRI' {'coordPRI'} 'SC' {'coordSC'} }
  $prows += @{ index = $i; organizationName = $FIX.Organizacao; regionName = $FIX.Regiao
               unitName = $un.Unidade; coordinationName = $un.Coordenadoria
               partnerName = $p.Nome; officeName = $p.Nome; city = $p.Cidade; state = $p.UF
               cnpj = (New-CnpjSintetico -Seq $i)
               coordinatorEmail = $cred[$coordChave].Email; managerEmail = $cred[$p.GC].Email }
}
$previaParceiros = Invoke-SimRpc -Sessao $sAdmin -Nome 'admin_import_partners' -Carga @{ p_rows = $prows; p_commit = $false }
Write-Host ("  previa: inseridos=$($previaParceiros.inserted) atualizados=$($previaParceiros.updated) erros=$($previaParceiros.errors)")
if ([int]$previaParceiros.errors -gt 0) {
  $previaParceiros.report | Where-Object { $_.status -ne 'ok' } | Select-Object -First 5 | ForEach-Object { Write-Host ('  ' + ($_ | ConvertTo-Json -Depth 6 -Compress)) }
  throw 'Importador de parceiros recusou linhas.'
}
$okParceiros = Invoke-SimRpc -Sessao $sAdmin -Nome 'admin_import_partners' -Carga @{ p_rows = $prows; p_commit = $true }
Write-Host ("  commit: inseridos=$($okParceiros.inserted) atualizados=$($okParceiros.updated) erros=$($okParceiros.errors)")

# --- 7. Persistencia das credenciais, FORA do Git --------------------------
$saida = @{}
foreach ($k in $cred.Keys) {
  $saida[$k] = @{ Email = $cred[$k].Email; Nome = $cred[$k].Nome; Papel = $cred[$k].Papel
                  Area = $cred[$k].Area; Senha = $cred[$k].SenhaFinal }
}
($saida | ConvertTo-Json -Depth 6) | Out-File -Encoding utf8 $ArquivoCredenciais
Write-Host ''
Write-Host "CONTAS E TOPOLOGIA PRONTAS. Credenciais em: $ArquivoCredenciais"

