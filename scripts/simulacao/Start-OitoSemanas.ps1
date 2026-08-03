# =============================================================================
# AAPEx 1.3.5 - Laboratorio de Simulacao - OITO SEMANAS DE GESTAO ASSISTIDA
# =============================================================================
# 14 parceiros x 8 semanas = 112 ciclos, 13 indicadores cada = 1.456 medicoes.
#
# CADA GERENTE DE CANAL AUTENTICA-SE e opera SOMENTE os seus parceiros. Nao ha
# service_role, nao ha SQL de escrita, nao ha seed: `open_assisted_cycle`,
# `save_assisted_entry`, `save_action_plan` e `close_assisted_cycle` sao as
# mesmas RPCs que a interface chama, e a autoria gravada e a de quem assinou o
# token. Um GC que tentasse tocar parceiro alheio levaria `operacao fora do
# escopo` — e e por isso que o laco e por GC, nao por parceiro.
#
# A DATA E EXPLICITA: `open_assisted_cycle(operation_id, p_reference_date)` ja
# aceita a semana de referencia. Nao existe relogio falso aqui, e nao precisa
# existir — o proprio contrato da RPC permite registrar semana passada, com o
# calculo de semana feito NO SERVIDOR (`app.assisted_week_start`).
#
# REGRA DE STATUS: desde a 0053 a tolerancia amarela e PORCENTAGEM DA META
# (`assisted-status/1.3.5-b`), nao mais desvio absoluto. Os valores abaixo sao
# calculados sobre essa regra; calibra-los pela regra antiga encheria o
# laboratorio de `conforme` onde deveria haver `atencao`.
# =============================================================================

param(
  [Parameter(Mandatory)][string]$ArquivoCredenciais,
  [Parameter(Mandatory)][string]$Relatorio
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'SimApp.ps1')
$FIX = & (Join-Path $PSScriptRoot 'Fixture-Definicao.ps1')
$q = Join-Path $PSScriptRoot 'Invoke-SimSql.ps1'
$cred = Get-Content $ArquivoCredenciais -Raw | ConvertFrom-Json

# --- Mapa parceiro -> operationId + GC --------------------------------------
$ops = & $q -Sql "select o.id, o.partner_name, u.name as unidade from public.operations o join public.units u on u.id=o.unit_id order by o.partner_name"
$mapaOp = @{}
foreach ($o in $ops) { $mapaOp[$o.partner_name] = $o.id }
Write-Host ("Parceiros no banco: " + $ops.Count)

# --- Valor que produz o status desejado -------------------------------------
function Get-ValorPara {
  param([string]$Status, [double]$Meta, [double]$Tol, [string]$Direcao, [int]$Ruido)
  # Faixa amarela = Meta * (1 +- Tol/100). Escolhemos o MEIO da faixa para
  # `atencao` e ultrapassamos a borda para `nao_conforme`, com um ruido pequeno
  # para que nem dois parceiros repitam o mesmo numero.
  $delta = $Meta * ($Tol / 100.0)
  $r = ($Ruido % 7) / 100.0
  if ($Meta -eq 0) {
    # Meta zero torna a faixa amarela degenerada: nao existe `atencao` possivel.
    # Declarar isso e melhor do que fabricar um numero que mente sobre a regra.
    if ($Direcao -eq 'higher_better') {
      if ($Status -eq 'nao_conforme') { return [math]::Round(-1 - $r, 2) }
      return [math]::Round(1 + $r, 2)
    } else {
      if ($Status -eq 'nao_conforme') { return [math]::Round(1 + $r, 2) }
      return 0
    }
  }
  if ($Direcao -eq 'higher_better') {
    switch ($Status) {
      'conforme'     { return [math]::Round($Meta * (1.03 + $r), 2) }
      'atencao'      { return [math]::Round($Meta - ($delta * (0.45 + $r)), 2) }
      'nao_conforme' { return [math]::Round($Meta - ($delta * (1.35 + $r)), 2) }
    }
  } else {
    switch ($Status) {
      'conforme'     { return [math]::Round($Meta * (0.90 - $r), 2) }
      'atencao'      { return [math]::Round($Meta + ($delta * (0.45 + $r)), 2) }
      'nao_conforme' { return [math]::Round($Meta + ($delta * (1.35 + $r)), 2) }
    }
  }
}

# --- Trajetoria: que status o indicador `idx` tem na semana `w` -------------
function Get-StatusDesejado {
  param([string]$Perfil, [int]$Fator, [int]$Semana, [int]$Idx)
  # Regra de mistura: so uma MINORIA dos 13 indicadores segue o perfil em cada
  # semana. Sem isso um parceiro `critico` teria 13 desvios por ciclo, exigiria
  # 13 planos e o fechamento viraria um exercicio de volume, nao de regra.
  $alvo = (($Idx + $Fator + $Semana) % 13)
  $desviante = ($alvo -lt 2)          # 2 dos 13 por semana
  $desvianteExtra = ($alvo -lt 4)     # 4 dos 13, para o perfil critico

  switch ($Perfil) {
    'melhora' {
      if (-not $desviante) { return 'conforme' }
      if ($Semana -le 1) { return 'nao_conforme' }
      if ($Semana -le 3) { return 'atencao' }
      return 'conforme'
    }
    'queda' {
      if (-not $desviante) { return 'conforme' }
      if ($Semana -le 2) { return 'conforme' }
      if ($Semana -le 4) { return 'atencao' }
      return 'nao_conforme'
    }
    'estavel' {
      if ($desviante -and $Semana -eq 3) { return 'atencao' }
      return 'conforme'
    }
    'lacuna' {
      if ($desviante -and ($Semana -eq 2 -or $Semana -eq 5)) { return 'sem_dado' }
      if ($desviante -and $Semana -eq 6) { return 'atencao' }
      return 'conforme'
    }
    'recupera' {
      if (-not $desviante) { return 'conforme' }
      if ($Semana -le 1) { return 'conforme' }
      if ($Semana -le 3) { return 'nao_conforme' }
      if ($Semana -eq 4) { return 'atencao' }
      return 'conforme'
    }
    'critico' {
      if (-not $desvianteExtra) { return 'conforme' }
      if ($alvo -lt 2) { return 'nao_conforme' }
      return 'atencao'
    }
  }
  return 'conforme'
}

$log = @()
$totCiclos = 0; $totEntradas = 0; $totPlanos = 0; $totFechados = 0; $totRascunho = 0
$acoesPorAtor = @{}

foreach ($w in 0..7) {
  $semana = $FIX.Semanas[$w]
  Write-Host ""
  Write-Host ("===== SEMANA " + ($w+1) + "/8 : $semana =====")

  foreach ($gcChave in ($FIX.Usuarios | Where-Object { $_.Papel -eq 'channel_manager' } | ForEach-Object { $_.Chave })) {
    $meus = $FIX.Parceiros | Where-Object { $_.GC -eq $gcChave }
    if (-not $meus) { continue }
    $c = $cred.$gcChave
    $s = Connect-SimUser -Email $c.Email -Senha $c.Senha     # login REAL, por GC, por semana
    if (-not $acoesPorAtor.ContainsKey($c.Email)) { $acoesPorAtor[$c.Email] = 0 }
    $acoesPorAtor[$c.Email] += 1

    foreach ($p in $meus) {
      $opId = $mapaOp[$p.Nome]
      $traj = $FIX.Trajetorias[$p.Nome]

      # 1) abrir o ciclo da semana de referencia (idempotente por desenho)
      $ciclo = Invoke-SimRpc -Sessao $s -Nome 'open_assisted_cycle' -Carga @{ p_operation_id = $opId; p_reference_date = $semana }
      $acoesPorAtor[$c.Email] += 1
      $totCiclos++
      $entradas = $ciclo.entries
      $temLacuna = $false
      $desvios = @()

      # 2) registrar os 13 indicadores
      $idx = 0
      foreach ($e in $entradas) {
        $idx++
        $st = Get-StatusDesejado -Perfil $traj.Perfil -Fator $traj.Fator -Semana $w -Idx $idx
        $patch = @{}
        if ($st -eq 'sem_dado') {
          # SEM DADO e AUSENCIA: `actual` nulo, NUNCA zero.
          $patch = @{ actual = $null; observation = "[SIMULACAO] fonte indisponivel na semana $semana" }
          $temLacuna = $true
        } else {
          $val = Get-ValorPara -Status $st -Meta ([double]$e.target) -Tol ([double]$e.tolerance) -Direcao $e.direction -Ruido ($traj.Fator + $idx + $w)
          $patch = @{ actual = $val
                      sourcePeriod = $semana
                      sourceConsultedAt = $semana
                      sourceReference = "[SIMULACAO] Relatorio Oficial da Operacao - semana $semana"
                      observation = "[SIMULACAO] leitura sintetica" }
          if ($st -ne 'conforme') {
            # `${semana}` com chaves: um `$var:` e lido pelo PowerShell como
            # qualificador de escopo/drive e quebra o parsing do arquivo inteiro.
            $patch.diagnosis = "[SIMULACAO] Desvio de $($e.indicatorCode) na semana ${semana}: causa sintetica atribuida ao perfil '$($traj.Perfil)'."
          }
        }
        $r = Invoke-SimRpc -Sessao $s -Nome 'save_assisted_entry' -Carga @{ p_entry_id = $e.id; p_patch = $patch }
        $acoesPorAtor[$c.Email] += 1
        $totEntradas++
        if ($r.status -eq 'atencao' -or $r.status -eq 'nao_conforme') {
          $desvios += @{ EntryId = $e.id; Codigo = $e.indicatorCode; Status = $r.status }
        }
      }

      # 3) todo desvio exige plano de acao — e o servidor recusa o fechamento sem ele
      foreach ($d in $desvios) {
        $prazo = (Get-Date $semana).AddDays(21).ToString('yyyy-MM-dd')
        $null = Invoke-SimRpc -Sessao $s -Nome 'save_action_plan' -Carga @{
          p_input = @{ operationId = $opId; assistedEntryId = $d.EntryId
                       action = "[SIMULACAO] Plano para $($d.Codigo) - semana $semana"
                       problem = "[SIMULACAO] $($d.Codigo) em $($d.Status)"
                       rootCause = "[SIMULACAO] causa raiz sintetica do perfil $($traj.Perfil)"
                       owner = $c.Nome; dueDate = $prazo; priority = 'medium'
                       expectedEvidence = '[SIMULACAO] evidencia esperada'
                       status = 'not_started' } }
        $acoesPorAtor[$c.Email] += 1
        $totPlanos++
      }

      # 4) fechar. Ciclo com lacuna NAO fecha, e isso e o comportamento correto:
      #    item obrigatorio SEM DADO impede o fechamento (0041). Fica em rascunho.
      if ($temLacuna) {
        $totRascunho++
        $log += [pscustomobject]@{ semana=$semana; parceiro=$p.Nome; gc=$c.Email; estado='draft'; desvios=$desvios.Count; motivo='SEM DADO em item obrigatorio' }
      } else {
        $fech = Invoke-SimRpc -Sessao $s -Nome 'close_assisted_cycle' -Carga @{ p_cycle_id = $ciclo.id } -Silencioso
        $acoesPorAtor[$c.Email] += 1
        if ($fech.__erro) {
          $totRascunho++
          $log += [pscustomobject]@{ semana=$semana; parceiro=$p.Nome; gc=$c.Email; estado='draft'; desvios=$desvios.Count; motivo=($fech.mensagem -replace '\s+',' ').Substring(0,[Math]::Min(160,($fech.mensagem -replace '\s+',' ').Length)) }
        } else {
          $totFechados++
          $log += [pscustomobject]@{ semana=$semana; parceiro=$p.Nome; gc=$c.Email; estado=$fech.status; desvios=$desvios.Count; motivo='' }
        }
      }
    }
    Write-Host ("  $($c.Email): $($meus.Count) parceiro(s)")
  }
}

$resumo = [pscustomobject]@{
  ciclos = $totCiclos; entradas = $totEntradas; planos = $totPlanos
  fechados = $totFechados; rascunho = $totRascunho
  acoesPorAtor = $acoesPorAtor
  detalhe = $log
}
($resumo | ConvertTo-Json -Depth 8) | Out-File -Encoding utf8 $Relatorio

Write-Host ''
Write-Host '================ OITO SEMANAS ================'
Write-Host ("  ciclos abertos     : $totCiclos")
Write-Host ("  medicoes gravadas  : $totEntradas")
Write-Host ("  planos de acao     : $totPlanos")
Write-Host ("  ciclos fechados    : $totFechados")
Write-Host ("  ciclos em rascunho : $totRascunho")
Write-Host ("  relatorio: $Relatorio")
