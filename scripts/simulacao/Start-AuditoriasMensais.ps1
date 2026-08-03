# =============================================================================
# AAPEx 1.3.5 - Laboratorio de Simulacao - 28 AUDITORIAS MENSAIS
# =============================================================================
# 14 parceiros x 2 competencias (2026-06 e 2026-07) = 28 auditorias.
#
# QUEM FAZ O QUE, pela Matriz de Permissoes:
#   GC          - cria, responde, anexa evidencia, cria plano, ENVIA
#   COORDENADOR - DEVOLVE e APROVA (nunca o autor; o GC nao valida a si mesmo)
#
# A competencia e explicita em `start_monthly_audit(op, 'AAAA-MM')`: registrar
# mes passado e caminho oficial, nao gambiarra de relogio.
#
# NEGATIVAS QUE PROVAM A REGRA CERTA. A licao da Fase 11 e que negativa rodada
# contra auditoria ja aprovada passa pela mensagem errada ("nao esta em
# rascunho") e prova imutabilidade, nao a regra pretendida. Por isso o envio
# incompleto e tentado ANTES de responder tudo, com a auditoria em RASCUNHO, e a
# mensagem devolvida e conferida.
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
$cfgHttp = Get-SimConfig

$ops = & $q -Sql "select o.id, o.partner_name from public.operations o order by o.partner_name"
$mapaOp = @{}
foreach ($o in $ops) { $mapaOp[$o.partner_name] = $o.id }

# PNG sintetico minimo (1x1), gerado aqui — nenhum arquivo real e copiado.
$pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
$pngBytes = [Convert]::FromBase64String($pngB64)

$log = @(); $acoes = @{}
$totAud = 0; $totRespostas = 0; $totPlanos = 0; $totEvid = 0
$totAprovadas = 0; $totDevolvidas = 0; $negativas = @()

function Conta { param([string]$Email) if (-not $acoes.ContainsKey($Email)) { $acoes[$Email] = 0 }; $acoes[$Email] += 1 }

$idxAud = 0
foreach ($comp in $FIX.Competencias) {
  Write-Host ''
  Write-Host "===== COMPETENCIA $comp ====="
  foreach ($p in $FIX.Parceiros) {
    $idxAud++
    $opId = $mapaOp[$p.Nome]
    $gc = $cred.($p.GC)
    $coordChave = switch ($p.Sigla) { 'PRC' {'coordPRC'} 'PRI' {'coordPRI'} 'SC' {'coordSC'} }
    $co = $cred.$coordChave

    $sGc = Connect-SimUser -Email $gc.Email -Senha $gc.Senha
    Conta $gc.Email
    $aud = Invoke-SimRpc -Sessao $sGc -Nome 'start_monthly_audit' -Carga @{ p_operation_id = $opId; p_competence = $comp }
    Conta $gc.Email
    $totAud++

    # --- NEGATIVA 1: envio incompleto, com a auditoria ainda em rascunho ----
    if ($idxAud -eq 1) {
      $r = Invoke-SimRpc -Sessao $sGc -Nome 'submit_monthly_audit' -Carga @{ p_evaluation_id = $aud.id } -Silencioso
      $negativas += [pscustomobject]@{ prova='envio incompleto recusado'; parceiro=$p.Nome; competencia=$comp
                                       recusado=[bool]$r.__erro; mensagem=($r.mensagem -replace '\s+',' ') }
    }

    # --- Respostas aos 26 criterios ----------------------------------------
    $i = 0; $desvios = @()
    foreach ($cri in $aud.criteria) {
      $i++
      # Mistura deterministica por parceiro/competencia: a maioria conforme, uma
      # minoria nao conforme (que exige diagnostico E plano) e alguns N/A onde o
      # criterio admite — com justificativa, que o gatilho cobra.
      $sel = ($i + $FIX.Trajetorias[$p.Nome].Fator + $idxAud) % 10
      $st = 'conforme'
      if ($sel -eq 0 -and -not $cri.evidenceRequired) { $st = 'nao_conforme' }
      elseif ($sel -eq 1 -and $cri.allowsNa) { $st = 'nao_aplicavel' }

      $patch = @{ status = $st; observation = '[SIMULACAO] resposta sintetica' }
      if ($st -eq 'nao_conforme') {
        $patch.diagnosis = "[SIMULACAO] Nao conformidade em $($cri.criterionCode) na competencia $comp."
      }
      if ($st -eq 'nao_aplicavel') {
        $patch.justification = "[SIMULACAO] Criterio nao aplicavel ao parceiro nesta competencia."
      }
      $resp = Invoke-SimRpc -Sessao $sGc -Nome 'save_criterion_answer' -Carga @{ p_answer_id = $cri.answer.id; p_patch = $patch }
      Conta $gc.Email
      $totRespostas++
      if ($st -eq 'nao_conforme') { $desvios += @{ AnswerId = $cri.answer.id; Codigo = $cri.criterionCode } }

      # --- Evidencia fisica, onde o criterio a exige -----------------------
      if ($cri.evidenceRequired) {
        $res = Invoke-SimRpc -Sessao $sGc -Nome 'reserve_evidence_upload' -Carga @{
          p_evaluation_id = $aud.id; p_theme_id = $cri.criterionCode
          p_input = @{ name = "evidencia-sintetica-$comp.png"; mimeType = 'image/png'; sizeBytes = $pngBytes.Length } }
        Conta $gc.Email
        # Upload REAL no bucket, com o JWT do proprio GC.
        $uri = "$($cfgHttp.Url)/storage/v1/object/$($res.bucket)/$($res.path)"
        Invoke-RestMethod -Method Post -Uri $uri -Headers @{
          apikey = $cfgHttp.Anon; Authorization = "Bearer $($sGc.Token)"; 'Content-Type' = 'image/png' } -Body $pngBytes | Out-Null
        $null = Invoke-SimRpc -Sessao $sGc -Nome 'confirm_evidence_upload' -Carga @{ p_reservation_id = $res.reservationId }
        Conta $gc.Email
        $totEvid++
      }
    }

    # --- Plano de acao para cada nao conformidade --------------------------
    foreach ($d in $desvios) {
      $prazo = (Get-Date "$comp-01").AddDays(45).ToString('yyyy-MM-dd')
      $null = Invoke-SimRpc -Sessao $sGc -Nome 'save_action_plan' -Carga @{
        p_input = @{ operationId = $opId; evaluationId = $aud.id; monthlyCriterionAnswerId = $d.AnswerId
                     action = "[SIMULACAO] Plano mensal para $($d.Codigo) - $comp"
                     problem = "[SIMULACAO] nao conformidade em $($d.Codigo)"
                     rootCause = '[SIMULACAO] causa raiz sintetica'
                     owner = $gc.Nome; dueDate = $prazo; priority = 'high'
                     expectedEvidence = '[SIMULACAO] evidencia esperada'; status = 'not_started' } }
      Conta $gc.Email
      $totPlanos++
    }

    # --- Envio --------------------------------------------------------------
    $env_ = Invoke-SimRpc -Sessao $sGc -Nome 'submit_monthly_audit' -Carga @{ p_evaluation_id = $aud.id } -Silencioso
    Conta $gc.Email
    if ($env_.__erro) {
      $log += [pscustomobject]@{ competencia=$comp; parceiro=$p.Nome; estado='FALHA-ENVIO'; mensagem=($env_.mensagem -replace '\s+',' ') }
      continue
    }

    # --- Coordenador: devolucao em uma parte, depois aprovacao -------------
    $sCo = Connect-SimUser -Email $co.Email -Senha $co.Senha
    Conta $co.Email

    $devolver = ($idxAud % 7 -eq 3)   # 4 das 28 passam por devolucao e correcao
    if ($devolver) {
      $null = Invoke-SimRpc -Sessao $sCo -Nome 'validate_evaluation' -Carga @{
        p_evaluation_id = $aud.id; p_decision = 'returned'
        p_note = '[SIMULACAO] devolvida para correcao sintetica' }
      Conta $co.Email
      $totDevolvidas++

      # GC corrige e reenvia
      $sGc2 = Connect-SimUser -Email $gc.Email -Senha $gc.Senha
      $atual = Invoke-SimRpc -Sessao $sGc2 -Nome 'get_monthly_audit' -Carga @{ p_operation_id = $opId; p_competence = $comp }
      Conta $gc.Email
      $primeiro = $atual.criteria[0]
      $null = Invoke-SimRpc -Sessao $sGc2 -Nome 'save_criterion_answer' -Carga @{
        p_answer_id = $primeiro.answer.id
        p_patch = @{ status = 'conforme'; observation = '[SIMULACAO] corrigido apos devolucao' } }
      Conta $gc.Email
      $re = Invoke-SimRpc -Sessao $sGc2 -Nome 'submit_monthly_audit' -Carga @{ p_evaluation_id = $aud.id } -Silencioso
      Conta $gc.Email
      if ($re.__erro) {
        $log += [pscustomobject]@{ competencia=$comp; parceiro=$p.Nome; estado='FALHA-REENVIO'; mensagem=($re.mensagem -replace '\s+',' ') }
        continue
      }
      $sCo = Connect-SimUser -Email $co.Email -Senha $co.Senha
    }

    # --- NEGATIVA 2: o autor tentando validar a propria auditoria -----------
    if ($idxAud -eq 2) {
      $auto = Invoke-SimRpc -Sessao $sGc -Nome 'validate_evaluation' -Carga @{
        p_evaluation_id = $aud.id; p_decision = 'approved'; p_note = 'tentativa do autor' } -Silencioso
      $negativas += [pscustomobject]@{ prova='autor nao valida a propria auditoria'; parceiro=$p.Nome; competencia=$comp
                                       recusado=[bool]$auto.__erro; mensagem=($auto.mensagem -replace '\s+',' ') }
    }

    $ap = Invoke-SimRpc -Sessao $sCo -Nome 'validate_evaluation' -Carga @{
      p_evaluation_id = $aud.id; p_decision = 'approved'
      p_note = '[SIMULACAO] aprovada pelo coordenador sintetico' } -Silencioso
    Conta $co.Email
    if ($ap.__erro) {
      $log += [pscustomobject]@{ competencia=$comp; parceiro=$p.Nome; estado='FALHA-APROVACAO'; mensagem=($ap.mensagem -replace '\s+',' ') }
    } else {
      $totAprovadas++
      $log += [pscustomobject]@{ competencia=$comp; parceiro=$p.Nome; estado='approved'
                                 devolvida=$devolver; naoConformidades=$desvios.Count; mensagem='' }
    }
    Write-Host ("  {0,-24} {1}  desvios={2} devolvida={3}" -f $p.Nome, $comp, $desvios.Count, $devolver)
  }
}

$resumo = [pscustomobject]@{
  auditorias = $totAud; respostas = $totRespostas; planos = $totPlanos; evidencias = $totEvid
  aprovadas = $totAprovadas; devolvidas = $totDevolvidas
  negativas = $negativas; acoesPorAtor = $acoes; detalhe = $log
}
($resumo | ConvertTo-Json -Depth 8) | Out-File -Encoding utf8 $Relatorio

Write-Host ''
Write-Host '============== AUDITORIAS MENSAIS =============='
Write-Host ("  auditorias criadas : $totAud")
Write-Host ("  respostas gravadas : $totRespostas")
Write-Host ("  evidencias fisicas : $totEvid")
Write-Host ("  planos de acao     : $totPlanos")
Write-Host ("  devolvidas         : $totDevolvidas")
Write-Host ("  APROVADAS          : $totAprovadas")
foreach ($n in $negativas) { Write-Host ("  [negativa] $($n.prova): recusado=$($n.recusado)") }
Write-Host ("  relatorio: $Relatorio")
