# =============================================================================
# AAPEx 1.3.5 - Laboratorio de Simulacao - DEFINICAO DETERMINISTICA DA FIXTURE
# =============================================================================
# So DADOS. Nenhum DDL, nenhuma senha, nenhuma escrita. E' o contrato do que a
# simulacao deve conter — a topologia, as pessoas ficticias e as trajetorias.
#
# Nomes inequivocamente sinteticos e dominio RESERVADO `sim.example`
# (RFC 2606/6761): nao resolve, nao tem dono e nenhum e-mail pode ser entregue a
# uma pessoa real. Nenhum nome, e-mail ou documento foi copiado de lugar nenhum.
# =============================================================================

$SIM = @{}

$SIM.Organizacao = 'ORGANIZACAO SIMULACAO AAPEX'
$SIM.Regiao      = 'RPS SIMULACAO'
$SIM.Dominio     = 'sim.example'

# --- Unidades e coordenadorias (uma coordenadoria por unidade) ---------------
$SIM.Unidades = @(
  @{ Unidade = 'PR CAPITAL SIM';     Coordenadoria = 'COORD PR CAPITAL SIM';     Sigla = 'PRC' }
  @{ Unidade = 'PR INTERIOR SIM';    Coordenadoria = 'COORD PR INTERIOR SIM';    Sigla = 'PRI' }
  @{ Unidade = 'SANTA CATARINA SIM'; Coordenadoria = 'COORD SANTA CATARINA SIM'; Sigla = 'SC'  }
)

# --- 14 parceiros: 4 + 6 + 4, a mesma distribuicao da topologia real ---------
$SIM.Parceiros = @(
  @{ Nome = 'PARCEIRO SIM PRC 01'; Sigla='PRC'; Cidade='CIDADE SIM A'; UF='PR'; GC = 'gc01' }
  @{ Nome = 'PARCEIRO SIM PRC 02'; Sigla='PRC'; Cidade='CIDADE SIM A'; UF='PR'; GC = 'gc02' }
  @{ Nome = 'PARCEIRO SIM PRC 03'; Sigla='PRC'; Cidade='CIDADE SIM B'; UF='PR'; GC = 'gc03' }
  @{ Nome = 'PARCEIRO SIM PRC 04'; Sigla='PRC'; Cidade='CIDADE SIM B'; UF='PR'; GC = 'gc04' }
  @{ Nome = 'PARCEIRO SIM PRI 01'; Sigla='PRI'; Cidade='CIDADE SIM C'; UF='PR'; GC = 'gc05' }
  @{ Nome = 'PARCEIRO SIM PRI 02'; Sigla='PRI'; Cidade='CIDADE SIM C'; UF='PR'; GC = 'gc05' }
  @{ Nome = 'PARCEIRO SIM PRI 03'; Sigla='PRI'; Cidade='CIDADE SIM D'; UF='PR'; GC = 'gc06' }
  @{ Nome = 'PARCEIRO SIM PRI 04'; Sigla='PRI'; Cidade='CIDADE SIM D'; UF='PR'; GC = 'gc06' }
  @{ Nome = 'PARCEIRO SIM PRI 05'; Sigla='PRI'; Cidade='CIDADE SIM E'; UF='PR'; GC = 'gc07' }
  @{ Nome = 'PARCEIRO SIM PRI 06'; Sigla='PRI'; Cidade='CIDADE SIM E'; UF='PR'; GC = 'gc08' }
  @{ Nome = 'PARCEIRO SIM SC 01';  Sigla='SC';  Cidade='CIDADE SIM F'; UF='SC'; GC = 'gc09' }
  @{ Nome = 'PARCEIRO SIM SC 02';  Sigla='SC';  Cidade='CIDADE SIM F'; UF='SC'; GC = 'gc10' }
  @{ Nome = 'PARCEIRO SIM SC 03';  Sigla='SC';  Cidade='CIDADE SIM G'; UF='SC'; GC = 'gc11' }
  @{ Nome = 'PARCEIRO SIM SC 04';  Sigla='SC';  Cidade='CIDADE SIM G'; UF='SC'; GC = 'gc12' }
)

# --- 17 contas: 1 admin + 1 regional + 3 coordenadores + 12 GCs -------------
# `Area` e a "area de atuacao" que `admin_import_users` espera: para `regional`
# e o nome da REGIAO; para `coordinator` e `channel_manager`, o da COORDENADORIA.
$SIM.Usuarios = @(
  @{ Chave='admin';    Nome='ADMINISTRADOR SIMULACAO'; Email="admin.sim@sim.example";    Papel='admin';           Area='RPS SIMULACAO' }
  @{ Chave='regional'; Nome='GERENTE REGIONAL SIM';    Email="regional.sim@sim.example"; Papel='regional';        Area='RPS SIMULACAO' }
  @{ Chave='coordPRC'; Nome='COORDENADOR SIM PRC';     Email="coord.prc.sim@sim.example";Papel='coordinator';     Area='COORD PR CAPITAL SIM' }
  @{ Chave='coordPRI'; Nome='COORDENADOR SIM PRI';     Email="coord.pri.sim@sim.example";Papel='coordinator';     Area='COORD PR INTERIOR SIM' }
  @{ Chave='coordSC';  Nome='COORDENADOR SIM SC';      Email="coord.sc.sim@sim.example"; Papel='coordinator';     Area='COORD SANTA CATARINA SIM' }
  @{ Chave='gc01'; Nome='GERENTE DE CANAL SIM 01'; Email="gc01.sim@sim.example"; Papel='channel_manager'; Area='COORD PR CAPITAL SIM' }
  @{ Chave='gc02'; Nome='GERENTE DE CANAL SIM 02'; Email="gc02.sim@sim.example"; Papel='channel_manager'; Area='COORD PR CAPITAL SIM' }
  @{ Chave='gc03'; Nome='GERENTE DE CANAL SIM 03'; Email="gc03.sim@sim.example"; Papel='channel_manager'; Area='COORD PR CAPITAL SIM' }
  @{ Chave='gc04'; Nome='GERENTE DE CANAL SIM 04'; Email="gc04.sim@sim.example"; Papel='channel_manager'; Area='COORD PR CAPITAL SIM' }
  @{ Chave='gc05'; Nome='GERENTE DE CANAL SIM 05'; Email="gc05.sim@sim.example"; Papel='channel_manager'; Area='COORD PR INTERIOR SIM' }
  @{ Chave='gc06'; Nome='GERENTE DE CANAL SIM 06'; Email="gc06.sim@sim.example"; Papel='channel_manager'; Area='COORD PR INTERIOR SIM' }
  @{ Chave='gc07'; Nome='GERENTE DE CANAL SIM 07'; Email="gc07.sim@sim.example"; Papel='channel_manager'; Area='COORD PR INTERIOR SIM' }
  @{ Chave='gc08'; Nome='GERENTE DE CANAL SIM 08'; Email="gc08.sim@sim.example"; Papel='channel_manager'; Area='COORD PR INTERIOR SIM' }
  @{ Chave='gc09'; Nome='GERENTE DE CANAL SIM 09'; Email="gc09.sim@sim.example"; Papel='channel_manager'; Area='COORD SANTA CATARINA SIM' }
  @{ Chave='gc10'; Nome='GERENTE DE CANAL SIM 10'; Email="gc10.sim@sim.example"; Papel='channel_manager'; Area='COORD SANTA CATARINA SIM' }
  @{ Chave='gc11'; Nome='GERENTE DE CANAL SIM 11'; Email="gc11.sim@sim.example"; Papel='channel_manager'; Area='COORD SANTA CATARINA SIM' }
  @{ Chave='gc12'; Nome='GERENTE DE CANAL SIM 12'; Email="gc12.sim@sim.example"; Papel='channel_manager'; Area='COORD SANTA CATARINA SIM' }
)

# --- Oito semanas ISO consecutivas (segunda-feira), cobrindo junho e julho ---
$SIM.Semanas = @('2026-06-01','2026-06-08','2026-06-15','2026-06-22','2026-06-29','2026-07-06','2026-07-13','2026-07-20')
$SIM.Competencias = @('2026-06','2026-07')

# --- Trajetorias: cada parceiro evolui de um jeito, e isso e o ponto ---------
# Com numeros iguais em todos os parceiros o painel ficaria uniforme e nao
# provaria nada. `Perfil` decide a curva; `Fator` desloca o parceiro dentro do
# perfil para que nem dois parceiros do mesmo perfil coincidam.
#   melhora   - comeca abaixo e sobe, cruzando a faixa de atencao
#   queda     - comeca conforme e cai ate nao conformidade
#   estavel   - oscila dentro da conformidade
#   lacuna    - tem semanas SEM DADO (null), nunca zero
#   recupera  - cai, recebe plano e volta
#   critico   - varios indicadores em nao conformidade, exige varios planos
$SIM.Trajetorias = @{
  'PARCEIRO SIM PRC 01' = @{ Perfil='melhora';  Fator=0 }
  'PARCEIRO SIM PRC 02' = @{ Perfil='queda';    Fator=1 }
  'PARCEIRO SIM PRC 03' = @{ Perfil='estavel';  Fator=2 }
  'PARCEIRO SIM PRC 04' = @{ Perfil='lacuna';   Fator=3 }
  'PARCEIRO SIM PRI 01' = @{ Perfil='recupera'; Fator=4 }
  'PARCEIRO SIM PRI 02' = @{ Perfil='critico';  Fator=5 }
  'PARCEIRO SIM PRI 03' = @{ Perfil='melhora';  Fator=6 }
  'PARCEIRO SIM PRI 04' = @{ Perfil='estavel';  Fator=7 }
  'PARCEIRO SIM PRI 05' = @{ Perfil='queda';    Fator=8 }
  'PARCEIRO SIM PRI 06' = @{ Perfil='lacuna';   Fator=9 }
  'PARCEIRO SIM SC 01'  = @{ Perfil='recupera'; Fator=10 }
  'PARCEIRO SIM SC 02'  = @{ Perfil='estavel';  Fator=11 }
  'PARCEIRO SIM SC 03'  = @{ Perfil='critico';  Fator=12 }
  'PARCEIRO SIM SC 04'  = @{ Perfil='melhora';  Fator=13 }
}

# --- O 13o indicador, criado pelo caminho real do catalogo ------------------
# Producao tem 13 configuracoes: os 12 canonicos de 0021 mais um criado pela
# interface de Admin. A simulacao reproduz a FORMA, com conteudo sintetico.
$SIM.Indicador13 = @{
  Codigo = 'IND-SIM-013'
  Nome   = 'Indicador Sintetico de Simulacao'
  Unidade= '%'
  Direcao= 'higher_better'
  Meta   = 75
  Tolerancia = 12
  Peso   = 3
}

$SIM.AvisoCriterio = 'CRITERIO SINTETICO DE SIMULACAO - SEM APROVACAO EMPRESARIAL PARA PRODUCAO'

$SIM

