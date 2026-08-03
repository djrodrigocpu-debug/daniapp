# =============================================================================
# AAPEx 1.3.5 - Laboratorio de Simulacao - ARQUIVO LOCAL DE ACESSOS
# =============================================================================
# Escreve o UNICO lugar onde as senhas sinteticas existem em texto: um arquivo
# fora do Git, no perfil do proprietario. As senhas nao aparecem no repositorio,
# no relatorio, no log nem na conversa.
#
# Permissoes: a ACL e reescrita para conceder acesso SOMENTE ao usuario atual e
# ao SYSTEM, com heranca desativada.
# =============================================================================

param(
  [Parameter(Mandatory)][string]$ArquivoCredenciais,
  [Parameter(Mandatory)][string]$Destino,
  [string]$UrlPreview = '(preencher apos o deploy)'
)

$ErrorActionPreference = 'Stop'
$FIX = & (Join-Path $PSScriptRoot 'Fixture-Definicao.ps1')
$q = Join-Path $PSScriptRoot 'Invoke-SimSql.ps1'
$cred = Get-Content $ArquivoCredenciais -Raw | ConvertFrom-Json

# Parceiros por GC, lidos do BANCO (o que vale e o vinculo real, nao a intencao).
$vinc = & $q -Sql "select us.corporate_email as email, string_agg(o.partner_name, ' + ' order by o.partner_name) as parceiros from public.operation_assignments a join public.users us on us.id=a.user_id join public.operations o on o.id=a.operation_id where a.active group by us.corporate_email"
$mapa = @{}
foreach ($v in $vinc) { $mapa[$v.email] = $v.parceiros }

$PODE = @{
  'admin'           = 'Configurar catalogo e criterios (por RPC); publicar configuracoes regionais e ponderacao; consultar TODOS os 14 parceiros, painel, matriz e relatorios; validar auditorias.'
  'regional'        = 'Consultar toda a regiao RPS SIMULACAO e as 3 unidades; administrar o catalogo da propria regiao; validar auditorias da regiao.'
  'coordinator'     = 'Consultar SOMENTE a propria coordenadoria; revisar, DEVOLVER e APROVAR auditorias dos seus parceiros; validar planos que nao criou.'
  'channel_manager' = 'Abrir ciclo semanal, registrar os 13 indicadores, diagnosticar, criar plano, fechar ciclo, criar/responder Auditoria Mensal, anexar evidencia e ENVIAR - somente nos parceiros atribuidos.'
}
$NAOPODE = @{
  'admin'           = 'NAO abre nem preenche ciclo da Gestao Assistida (is_assisted_operator exige channel_manager COM vinculo). NAO altera snapshot aprovado. NAO exclui objeto com historico.'
  'regional'        = 'NAO abre nem preenche ciclo. NAO configura o cutover (parametro nacional, admin-only). NAO acessa outra regiao.'
  'coordinator'     = 'NAO abre nem preenche ciclo. NAO administra catalogo. NAO acessa coordenadoria alheia. NAO valida plano que ele mesmo criou.'
  'channel_manager' = 'NAO valida a propria auditoria nem o proprio plano. NAO edita meta, tema ou indicador. NAO acessa parceiro de outro GC (recebe "operacao fora do escopo").'
}
$UNIDADE = @{
  'COORD PR CAPITAL SIM' = 'PR CAPITAL SIM'; 'COORD PR INTERIOR SIM' = 'PR INTERIOR SIM'
  'COORD SANTA CATARINA SIM' = 'SANTA CATARINA SIM'; 'RPS SIMULACAO' = '(todas as 3 unidades)'
}

$L = New-Object Collections.Generic.List[string]
$L.Add('===============================================================================')
$L.Add('  AAPEx 1.3.5 - ACESSOS DO LABORATORIO DE SIMULACAO')
$L.Add('  *** SOMENTE SIMULACAO - DADOS INTEIRAMENTE FICTICIOS - NAO E PRODUCAO ***')
$L.Add('===============================================================================')
$L.Add('')
$L.Add('  Nenhuma destas contas pertence a uma pessoa real. O dominio sim.example e')
$L.Add('  RESERVADO (RFC 2606/6761): nao resolve e nenhum e-mail pode ser entregue.')
$L.Add('  Recuperacao de senha e convite externo NAO estao configurados neste projeto.')
$L.Add('')
$L.Add('  Banco de dados : qjvpkaurihjvzktlinhp  (Supabase - HOMOLOGACAO)')
$L.Add('  PRODUCAO e STAGING nao foram tocados por este laboratorio.')
$L.Add("  URL do Preview : $UrlPreview")
$L.Add('')
$L.Add('  PRIMEIRO ACESSO: as senhas abaixo sao as FINAIS. O gate de troca de senha')
$L.Add('  ja foi cumprido para as 16 contas provisionadas, entao o aplicativo NAO vai')
$L.Add('  pedir troca. Basta entrar com o e-mail e a senha.')
$L.Add('')
$L.Add('  A faixa vermelha "AMBIENTE DE SIMULACAO" deve aparecer em TODAS as telas.')
$L.Add('  Se ela nao aparecer, PARE: o ambiente aberto nao e o laboratorio.')
$L.Add('')

$ordem = @('admin','regional','coordPRC','coordPRI','coordSC') + (1..12 | ForEach-Object { 'gc{0:D2}' -f $_ })
foreach ($k in $ordem) {
  $c = $cred.$k
  if (-not $c) { continue }
  $parceiros = if ($mapa.ContainsKey($c.Email)) { $mapa[$c.Email] } else { '(consulta global no seu escopo - nao opera parceiro)' }
  $L.Add('-------------------------------------------------------------------------------')
  $L.Add("  NOME          : $($c.Nome)")
  $L.Add("  PAPEL         : $($c.Papel)")
  $L.Add("  E-MAIL        : $($c.Email)")
  $L.Add("  SENHA         : $($c.Senha)")
  $L.Add("  AREA          : $($c.Area)")
  $L.Add("  UNIDADE       : $(if ($UNIDADE.ContainsKey($c.Area)) { $UNIDADE[$c.Area] } else { $c.Area })")
  $L.Add("  COORDENADORIA : $(if ($c.Papel -eq 'admin' -or $c.Papel -eq 'regional') { '(todas)' } else { $c.Area })")
  $L.Add("  PARCEIROS     : $parceiros")
  $L.Add("  PODE          : $($PODE[$c.Papel])")
  $L.Add("  NAO PODE      : $($NAOPODE[$c.Papel])")
}
$L.Add('-------------------------------------------------------------------------------')
$L.Add('')
$L.Add('  CONFERIDO? Marque cada conta ao verificar:')
$L.Add('')
$L.Add('   [ ] Administrador          - ve 14 parceiros e 13 configuracoes')
$L.Add('   [ ] Gerente Regional       - ve a regiao inteira e as 3 unidades')
foreach ($k in @('coordPRC','coordPRI','coordSC')) { $L.Add("   [ ] $($cred.$k.Nome.PadRight(24)) - ve SOMENTE a propria coordenadoria") }
foreach ($i in 1..12) { $k = 'gc{0:D2}' -f $i; $L.Add("   [ ] $($cred.$k.Nome.PadRight(24)) - ve SOMENTE os parceiros atribuidos") }
$L.Add('')
$L.Add('  LIMPEZA NAO AUTORIZADA. A simulacao permanece intacta ate a frase literal:')
$L.Add('  AUTORIZO LIMPEZA DA SIMULACAO AAPEX 1.3.5')
$L.Add('')

[IO.File]::WriteAllLines($Destino, $L, (New-Object Text.UTF8Encoding($false)))

# ACL restritiva: so o usuario atual e o SYSTEM, sem heranca.
$acl = Get-Acl $Destino
$acl.SetAccessRuleProtection($true, $false)
foreach ($r in @($acl.Access)) { [void]$acl.RemoveAccessRule($r) }
foreach ($id in @("$env:USERDOMAIN\$env:USERNAME", 'NT AUTHORITY\SYSTEM')) {
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($id, 'FullControl', 'Allow')))
}
Set-Acl -Path $Destino -AclObject $acl

Write-Host "Arquivo de acessos gravado em: $Destino"
Write-Host ("Contas: " + $ordem.Count + " | permissoes restritas ao usuario atual e ao SYSTEM")
