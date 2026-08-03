# =============================================================================
# AAPEx 1.3.5 - Laboratorio de Simulacao - GUARDA EXECUTAVEL DE AMBIENTE
# =============================================================================
# Unico alvo autorizado para ESCRITA: o projeto Supabase de HOMOLOGACAO.
# Producao e staging sao proibidos, e a proibicao nao depende de disciplina:
# nenhum comando de escrita deste laboratorio roda sem passar por aqui.
#
# A guarda aborta com codigo 90 e NUNCA imprime segredo: so o identificador do
# projeto entra no log. Chaves, senhas e tokens nao passam por esta funcao.
#
# Ordem das verificacoes (a mesma das RPCs do produto: o mais grave primeiro):
#   1. ref explicito ausente          -> aborta
#   2. ref explicito proibido         -> aborta
#   3. ref explicito != autorizado    -> aborta
#   4. ref vinculado != autorizado    -> aborta
#   5. variavel de ambiente com ref proibido -> aborta
#   6. carga (SQL/argumentos) citando ref proibido -> aborta
#
# Dot-source este arquivo e chame Assert-AlvoSimulacao antes de qualquer escrita.
# =============================================================================

# NAO habilitar Set-StrictMode aqui: este arquivo e dot-sourced, e o modo estrito
# vazaria para a sessao de quem chama, quebrando codigo alheio que le variavel
# ainda nao definida. A guarda protege o ambiente, nao reescreve o do chamador.

$script:SIM_REF_AUTORIZADO = 'qjvpkaurihjvzktlinhp'   # AAPEx 1.3.5 Homologacao
$script:SIM_REFS_PROIBIDOS = @(
  'plnbgdabciwygsmnyddy',   # PRODUCAO  - escrita terminantemente proibida
  'qcixfsdyfpankpatbays'    # STAGING   - congelado, escrita proibida
)
$script:SIM_EXIT_ABORTO = 90

function Write-GuardaLog {
  param([string]$Mensagem)
  Write-Host "[GUARDA] $Mensagem"
}

function Stop-PorGuarda {
  param([string]$Motivo)
  Write-Host ''
  Write-Host '================================================================'
  Write-Host ' GUARDA DE AMBIENTE: OPERACAO ABORTADA'
  Write-Host " Motivo: $Motivo"
  Write-Host " Alvo autorizado: $script:SIM_REF_AUTORIZADO"
  Write-Host '================================================================'
  throw "GUARDA-DE-AMBIENTE-ABORTOU: $Motivo"
}

function Get-RefVinculado {
  $repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  $arquivo = Join-Path $repo 'supabase\.temp\project-ref'
  if (-not (Test-Path $arquivo)) { return $null }
  return (Get-Content $arquivo -Raw).Trim()
}

function Repair-VinculoSimulacao {
  <#
    .SYNOPSIS
      Forca o vinculo da CLI PARA o alvo autorizado, quando ele tiver escorregado.
    .DESCRIPTION
      A CLI reescreve `supabase/.temp/project-ref` sozinha a partir do estado do
      servidor, que marca a PRODUCAO como projeto vinculado. Medido em 03/08/2026.
      Esta funcao so aponta o vinculo PARA a homologacao; nunca para longe dela,
      e por isso nao afrouxa a guarda. Quem decide se a operacao segue continua
      sendo Assert-AlvoSimulacao, que confere depois e aborta se o reparo falhou.
  #>
  # Copia local antes de chamar a CLI: `npx.ps1` remonta os argumentos e passa
  # por Invoke-Expression, que reavalia o texto em OUTRO escopo — uma referencia
  # `$script:` chega la como nome de variavel inexistente, nao como valor.
  $alvo = [string]$script:SIM_REF_AUTORIZADO
  $vinculado = Get-RefVinculado
  if ($vinculado -eq $alvo) { return }
  Write-GuardaLog "vinculo estava em '$vinculado'; reapontando para o alvo autorizado"
  $repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  Push-Location $repo
  try { $null = (& npx --no-install supabase link --project-ref "$alvo" --yes) | Out-String }
  finally { Pop-Location }
}

function Assert-AlvoSimulacao {
  <#
    .SYNOPSIS
      Autoriza (ou aborta) uma operacao de escrita do laboratorio de simulacao.
    .PARAMETER ProjectRef
      Project Ref EXPLICITO do alvo. Obrigatorio: nao existe alvo implicito.
    .PARAMETER Carga
      Texto que sera enviado ao banco (SQL, corpo, argumentos). Inspecionado a
      procura de ref proibido. Opcional, mas recomendado.
    .PARAMETER Operacao
      Rotulo da operacao, so para o log.
  #>
  param(
    [string]$ProjectRef,
    [string]$Carga = '',
    [string]$Operacao = 'escrita'
  )

  # 1. Ref explicito ausente. Alvo implicito e como nao ter alvo.
  if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
    Stop-PorGuarda 'Project Ref explicito ausente. O laboratorio nao infere alvo.'
  }
  $ref = $ProjectRef.Trim()

  # 2. Ref explicito proibido.
  foreach ($proibido in $script:SIM_REFS_PROIBIDOS) {
    if ($ref -eq $proibido) {
      Stop-PorGuarda "Project Ref '$ref' e um ambiente PROIBIDO para escrita."
    }
  }

  # 3. Ref explicito diferente do autorizado.
  if ($ref -ne $script:SIM_REF_AUTORIZADO) {
    Stop-PorGuarda "Project Ref '$ref' nao e o alvo autorizado da simulacao."
  }

  # 4. Ref vinculado na CLI precisa ser o mesmo. Um link trocado por engano
  #    mandaria o comando para outro lugar mesmo com o argumento certo.
  $vinculado = Get-RefVinculado
  if ($null -eq $vinculado) {
    Stop-PorGuarda 'Nenhum projeto vinculado (supabase/.temp/project-ref ausente).'
  }
  foreach ($proibido in $script:SIM_REFS_PROIBIDOS) {
    if ($vinculado -eq $proibido) {
      Stop-PorGuarda "CLI vinculada a ambiente PROIBIDO ('$vinculado')."
    }
  }
  if ($vinculado -ne $script:SIM_REF_AUTORIZADO) {
    Stop-PorGuarda "CLI vinculada a '$vinculado', diferente do alvo autorizado."
  }

  # 5. Variavel de ambiente apontando para producao ou staging. Basta existir:
  #    uma URL de producia no ambiente pode ser lida por qualquer ferramenta
  #    que este script invoque.
  foreach ($v in (Get-ChildItem Env: -ErrorAction SilentlyContinue)) {
    $valor = [string]$v.Value
    if ([string]::IsNullOrEmpty($valor)) { continue }
    foreach ($proibido in $script:SIM_REFS_PROIBIDOS) {
      if ($valor -like "*$proibido*") {
        Stop-PorGuarda "Variavel de ambiente '$($v.Name)' aponta para ambiente PROIBIDO."
      }
    }
  }

  # 6. Carga citando ref proibido.
  if (-not [string]::IsNullOrEmpty($Carga)) {
    foreach ($proibido in $script:SIM_REFS_PROIBIDOS) {
      if ($Carga -like "*$proibido*") {
        Stop-PorGuarda "A carga da operacao cita o ambiente PROIBIDO '$proibido'."
      }
    }
  }

  Write-GuardaLog "AUTORIZADO $Operacao -> projeto $script:SIM_REF_AUTORIZADO"
  return $true
}
