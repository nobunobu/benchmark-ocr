# AWS Bedrock Mistral Mixtral-8x7b Configuration

Este guia explica como configurar e usar o modelo Mistral Mixtral-8x7b-instruct-v0:1 do AWS Bedrock no benchmark OCR.

## Pré-requisitos

1. **Conta AWS** com acesso ao Amazon Bedrock
2. **Permissões IAM** adequadas para usar o Bedrock
3. **Acesso ao modelo Mistral** habilitado na sua região AWS

## Configuração

### 1. Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env`:

```bash
# AWS Credentials
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1  # ou sua região preferida
```

### 2. Permissões IAM

Certifique-se de que sua conta AWS tem as seguintes permissões:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream"
            ],
            "Resource": "arn:aws:bedrock:*::foundation-model/mistral.mixtral-8x7b-instruct-v0:1"
        }
    ]
}
```

### 3. Habilitar o Modelo

1. Acesse o console do AWS Bedrock
2. Vá para "Model access" no menu lateral
3. Encontre "Mistral Mixtral 8x7B Instruct" e solicite acesso
4. Aguarde a aprovação (pode levar alguns minutos)

## Teste da Conexão

Execute o script de teste para verificar se tudo está configurado corretamente:

```bash
npm run test-mistral
```

Este script irá:
- Verificar as credenciais AWS
- Testar a conexão com o modelo Mistral
- Executar uma extração de dados simples
- Mostrar estatísticas de uso e custo

## Uso no Benchmark

### Configuração no models.yaml

Para usar o Mistral no benchmark, adicione a seguinte configuração ao seu arquivo `src/models.yaml`:

```yaml
models:
  # Mistral para extração de texto (requer OCR separado)
  - ocr: gpt-4o  # ou qualquer outro modelo de OCR
    extraction: mistral.mixtral-8x7b-instruct-v0:1
```

**Importante**: O Mistral Mixtral-8x7b não suporta processamento direto de imagens. Ele só pode ser usado para extração de dados a partir de texto já processado por outro modelo de OCR.

### Exemplo de Uso

```typescript
import { AWSBedrockMistralProvider } from './src/models/awsBedrockMistral';

const provider = new AWSBedrockMistralProvider('mistral.mixtral-8x7b-instruct-v0:1');

// Extrair dados de texto
const result = await provider.extractFromText(ocrText, schema);
console.log(result.json);
```

## Limitações

1. **Sem suporte a imagens**: O modelo não pode processar imagens diretamente
2. **Apenas extração de texto**: Use apenas para o passo de extração, não para OCR
3. **Rate limits**: Respeite os limites de taxa do AWS Bedrock

## Custos

O Mistral Mixtral-8x7b tem os seguintes custos aproximados (verifique a documentação AWS para valores atuais):

- Input tokens: ~$0.0007 por 1K tokens
- Output tokens: ~$0.0024 por 1K tokens

## Troubleshooting

### Erro de Credenciais
```
AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY) are required
```
**Solução**: Verifique se as variáveis de ambiente estão definidas corretamente.

### Erro de Acesso ao Modelo
```
ValidationException: The model mistral.mixtral-8x7b-instruct-v0:1 is not available
```
**Solução**: Certifique-se de que o modelo está habilitado na sua região AWS.

### Throttling
```
ThrottlingException: Rate exceeded
```
**Solução**: O sistema tem retry automático, mas você pode precisar aguardar alguns minutos.

## Suporte

Para problemas específicos do AWS Bedrock, consulte:
- [Documentação oficial do AWS Bedrock](https://docs.aws.amazon.com/bedrock/)
- [Documentação do Mistral](https://docs.mistral.ai/) 