# Masterplan AAPEX / AACE V2.0 — Documentos canônicos

## Identificação

| Campo | Valor |
| --- | --- |
| Documento | Masterplan Executivo e Científico AAPEX / AACE |
| Versão | 2.0 — Baseline executiva e científica |
| Data do documento | 22 de julho de 2026 |
| Data de incorporação ao repositório | 22 de julho de 2026 |
| Programa | AAPEX — Programa de Excelência; app AACE Excelência Mobile |
| Unidade | Claro Empresas — Regional Paraná e Santa Catarina — Canal AACE |
| Classificação | Uso interno / confidencial |
| Status | Proposta estruturada para validação — **não constitui autorização de produção** |

## Finalidade

Este diretório contém a fonte normativa da implantação corporativa do AAPEX/AACE V2.0.
O Masterplan converte o Plano Master v1.0 e a Auditoria Técnica Preliminar em uma
especificação executiva, operacional, científica e técnica. Ele orienta toda a
implementação registrada em [`docs/MATRIZ_RASTREABILIDADE_AAPEX_V2.md`](../MATRIZ_RASTREABILIDADE_AAPEX_V2.md)
e [`docs/IMPLEMENTATION_STATUS_AAPEX_V2.md`](../IMPLEMENTATION_STATUS_AAPEX_V2.md).

## Arquivos canônicos

| Arquivo | Papel | Observação |
| --- | --- | --- |
| `MASTERPLAN_EXECUTIVO_CIENTIFICO_AAPEX_AACE_V2.pdf` | **Documento-fonte** | Autoridade principal |
| `MASTERPLAN_EXECUTIVO_CIENTIFICO_AAPEX_AACE_V2.docx` | **Documento-fonte** | Autoridade principal |
| `MASTERPLAN_EXECUTIVO_CIENTIFICO_AAPEX_AACE_V2.md` | Versão pesquisável | Transcrição estrutural fiel; não substitui PDF/DOCX |

> O PDF e o DOCX são os documentos-fonte e prevalecem sobre a versão Markdown em
> qualquer divergência de leitura. A versão `.md` existe para permitir busca, citação
> e rastreabilidade em código, testes e revisões.

## Ordem de autoridade documental

Conforme o critério de precedência do próprio Masterplan (Controle do documento):

1. **Decisão corporativa formal** expressamente confirmada
2. **Masterplan Executivo e Científico V2.0** (este diretório)
3. **Auditoria Técnica Preliminar AACE V2** (`docs/auditorias/`)
4. **Protótipo / código demonstrativo existente**

Em caso de conflito aparente, registra-se a contradição em
[`docs/DECISOES_PENDENTES_AAPEX_V2.md`](../DECISOES_PENDENTES_AAPEX_V2.md) e prossegue-se
com tudo o que não depender dela.

## Integridade — SHA-256 dos arquivos-fonte

| Arquivo | Bytes | SHA-256 |
| --- | --- | --- |
| `MASTERPLAN_EXECUTIVO_CIENTIFICO_AAPEX_AACE_V2.pdf` | 1.668.434 | `6685FDB4C3114D03F202F046D3C0F3F7856F0CE4EF10F8B48DD10747EB16E810` |
| `MASTERPLAN_EXECUTIVO_CIENTIFICO_AAPEX_AACE_V2.docx` | 681.035 | `4AA0BB7E60820C0D4172F810B8B58BD5593226A269779B1E8FD32C0489841C37` |

Documento de auditoria correlato (`docs/auditorias/`):

| Arquivo | SHA-256 |
| --- | --- |
| `AUDITORIA_TECNICA_PRELIMINAR_AACE_V2.md` | `F917058B22246377E96A9D67C82E80CF65A789BDA31ABB123B04498824847C6C` |

Para reconferir a integridade em qualquer máquina:

```bash
sha256sum docs/masterplan/MASTERPLAN_EXECUTIVO_CIENTIFICO_AAPEX_AACE_V2.pdf
sha256sum docs/masterplan/MASTERPLAN_EXECUTIVO_CIENTIFICO_AAPEX_AACE_V2.docx
```

No Windows (PowerShell):

```powershell
Get-FileHash docs/masterplan/MASTERPLAN_EXECUTIVO_CIENTIFICO_AAPEX_AACE_V2.pdf -Algorithm SHA256
```

## Como citar em código e commits

Use o número da seção do Masterplan e, quando houver, o identificador do requisito na
matriz de rastreabilidade. Exemplos:

- `// Masterplan §8.3 — servidor recalcula nota; cliente exibe prévia`
- `// REQ-RB-04 (Anexo B) — indicador usado nunca é apagado fisicamente`
