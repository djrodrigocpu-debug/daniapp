# =============================================================================
# AAPEx 1.3.5 - Laboratorio de Simulacao - CAMINHO REAL DO APLICATIVO
# =============================================================================
# Nada aqui usa service_role nem SQL direto para produzir evento operacional.
# Cada conta sintetica AUTENTICA-SE de verdade (GoTrue) e chama as MESMAS RPCs
# que a interface chama, com o SEU proprio JWT. RLS, grants e guardas de papel
# valem exatamente como valem para uma pessoa usando o aplicativo.
#
# O adendo e literal: "nao preencha tudo por service_role, SQL direto ou seed que
# falsifique a autoria". Entao a autoria dos 112 ciclos e das 28 auditorias e a
# autoria real de quem assinou o token.
# =============================================================================

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$script:SIM_REF = 'qjvpkaurihjvzktlinhp'

function Get-SimConfig {
  $raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  $env_ = Join-Path $raiz '.env'
  if (-not (Test-Path $env_)) { throw "Arquivo .env ausente em $raiz" }
  $url = $null; $anon = $null
  foreach ($l in (Get-Content $env_)) {
    if ($l -match '^\s*EXPO_PUBLIC_SUPABASE_URL\s*=\s*(.+?)\s*$')      { $url  = $matches[1].Trim('"').Trim("'") }
    if ($l -match '^\s*EXPO_PUBLIC_SUPABASE_ANON_KEY\s*=\s*(.+?)\s*$') { $anon = $matches[1].Trim('"').Trim("'") }
  }
  if (-not $url -or -not $anon) { throw '.env sem URL ou chave anon' }
  # GUARDA: o .env precisa apontar para o laboratorio, e so para ele.
  if ($url -notlike "*$script:SIM_REF*") {
    throw "GUARDA: EXPO_PUBLIC_SUPABASE_URL nao aponta para $script:SIM_REF. ABORTADO."
  }
  foreach ($proibido in @('plnbgdabciwygsmnyddy','qcixfsdyfpankpatbays')) {
    if ($url -like "*$proibido*" -or $anon -like "*$proibido*") {
      throw "GUARDA: .env cita ambiente PROIBIDO. ABORTADO."
    }
  }
  return [pscustomobject]@{ Url = $url.TrimEnd('/'); Anon = $anon }
}

# NAO reintroduzir cache com `$script:CFG`. Este arquivo e dot-sourced tanto de
# scripts invocados com `&` quanto do prompt, e `$script:` resolve para o escopo
# de QUEM carregou — o valor era gravado num escopo e lido nulo noutro. O sintoma
# era cruel: `Connect-SimUser` funcionava, `Invoke-SimRpc` montava a URI com host
# vazio e o Invoke-RestMethod estourava NullReferenceException SEM resposta HTTP,
# o que parecia erro de servidor. Ler o .env a cada chamada custa microssegundos
# e nao tem escopo para errar.

function Connect-SimUser {
  param([Parameter(Mandatory)][string]$Email, [Parameter(Mandatory)][string]$Senha)
  $c = Get-SimConfig
  $body = @{ email = $Email; password = $Senha } | ConvertTo-Json -Compress
  $r = Invoke-RestMethod -Method Post -Uri "$($c.Url)/auth/v1/token?grant_type=password" `
        -Headers @{ apikey = $c.Anon; 'Content-Type' = 'application/json' } -Body $body
  return [pscustomobject]@{ Token = $r.access_token; UserId = $r.user.id; Email = $Email }
}

function Invoke-SimRpc {
  # NAO renomear `Carga` para `Args`/`Args_`: `$Args` e variavel automatica do
  # PowerShell e o binder trata o prefixo `-Args` como ela, entregando a
  # hashtable como argumento posicional em vez de vincular ao parametro. O corpo
  # saia vazio e o Invoke-RestMethod estourava NullReference sem resposta HTTP.
  param(
    [Parameter(Mandatory)]$Sessao,
    [Parameter(Mandatory)][string]$Nome,
    [hashtable]$Carga = @{},
    [switch]$Silencioso
  )
  $c = Get-SimConfig
  $body = ($Carga | ConvertTo-Json -Depth 25 -Compress)
  if ($null -eq $body -or $body -eq 'null' -or [string]::IsNullOrWhiteSpace($body)) { $body = '{}' }
  try {
    return Invoke-RestMethod -Method Post -Uri "$($c.Url)/rest/v1/rpc/$Nome" `
      -Headers @{ apikey = $c.Anon; Authorization = "Bearer $($Sessao.Token)"; 'Content-Type' = 'application/json' } `
      -Body $body
  } catch {
    # CAPTURAR O ERRO ORIGINAL PRIMEIRO. Um `try/catch` interno REBINDA `$_`, e
    # ler `$_.Exception.Message` depois dele devolve a excecao do proprio
    # tratador — foi assim que um erro de servidor virou "Referencia de objeto
    # nao definida" e escondeu a causa real por duas rodadas.
    $orig = $_
    $det = ''
    if ($orig.ErrorDetails -and $orig.ErrorDetails.Message) { $det = $orig.ErrorDetails.Message }
    if (-not $det -and $orig.Exception.Response) {
      try {
        $st = $orig.Exception.Response.GetResponseStream()
        $det = (New-Object IO.StreamReader($st)).ReadToEnd()
      } catch { $det = '' }
    }
    if (-not $det) { $det = '[' + $orig.Exception.GetType().FullName + '] ' + $orig.Exception.Message + ' | alvo=' + $c.Url + '/rest/v1/rpc/' + $Nome + ' | corpo=' + $body.Length + 'B' }
    if ($Silencioso) { return [pscustomobject]@{ __erro = $true; mensagem = $det } }
    throw "RPC $Nome falhou para $($Sessao.Email): $det"
  }
}

function Invoke-SimEdge {
  param([Parameter(Mandatory)]$Sessao, [Parameter(Mandatory)][string]$Funcao, $Corpo = @{})
  $c = Get-SimConfig
  try {
    return Invoke-RestMethod -Method Post -Uri "$($c.Url)/functions/v1/$Funcao" `
      -Headers @{ apikey = $c.Anon; Authorization = "Bearer $($Sessao.Token)"; 'Content-Type' = 'application/json' } `
      -Body ($Corpo | ConvertTo-Json -Depth 25 -Compress)
  } catch {
    $det = ''
    try { $s = $_.Exception.Response.GetResponseStream(); $det = (New-Object IO.StreamReader($s)).ReadToEnd() } catch {}
    throw "Edge $Funcao falhou: $det"
  }
}

function Invoke-SimRest {
  param([Parameter(Mandatory)]$Sessao, [Parameter(Mandatory)][string]$Caminho)
  $c = Get-SimConfig
  return Invoke-RestMethod -Method Get -Uri "$($c.Url)/rest/v1/$Caminho" `
    -Headers @{ apikey = $c.Anon; Authorization = "Bearer $($Sessao.Token)" }
}

