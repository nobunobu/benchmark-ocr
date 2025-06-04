import { BedrockRuntimeClient, ConverseCommand, ConversationRole } from '@aws-sdk/client-bedrock-runtime';
import { ModelProvider } from './base';
import { JsonSchema, Usage } from '../types';
import { calculateTokenCost } from './shared/tokenCost';

// AWS Bedrock pricing for Mistral Mixtral 8x7B
// Costs are now centralized in tokenCost.ts

// Retry configuration for handling throttling
const MAX_RETRIES = 5;
const BASE_DELAY = 1000; // Base delay in milliseconds
const MAX_DELAY = 30000; // Maximum delay in milliseconds

export class AWSBedrockMistralProvider extends ModelProvider {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor(model: string) {
    super(model);
    
    // Set the Mistral model ID
    this.modelId = 'mistral.mixtral-8x7b-instruct-v0:1';

    // Verify AWS credentials
    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    
    if (!awsAccessKey || !awsSecretKey) {
      throw new Error('AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY) are required');
    }

    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: awsAccessKey,
        secretAccessKey: awsSecretKey,
      },
      maxAttempts: 1, // Disable SDK retries, we'll handle them manually
    });
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          // Calculate exponential backoff delay
          const delay = Math.min(BASE_DELAY * Math.pow(2, attempt - 1), MAX_DELAY);
          console.log(`⏳ ${operationName}: Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms delay...`);
          await this.sleep(delay);
        }
        
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Check if it's a throttling error
        if (error.name === 'ThrottlingException' || error.$metadata?.httpStatusCode === 429) {
          if (attempt < MAX_RETRIES) {
            console.log(`🚫 ${operationName}: Throttled, will retry (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
            continue;
          }
        } else {
          // For non-throttling errors, don't retry
          throw error;
        }
      }
    }
    
    throw new Error(`${operationName} failed after ${MAX_RETRIES + 1} attempts. Last error: ${lastError.message}`);
  }

  async ocr(imagePath: string): Promise<{
    text: string;
    imageBase64s?: string[];
    usage: Usage;
  }> {
    // Mistral Mixtral não suporta processamento direto de imagem
    // Este método não deve ser usado, mas implementamos para compatibilidade
    throw new Error('Mistral Mixtral-8x7b-instruct-v0:1 does not support direct image processing. Use extractFromText instead with pre-processed OCR text.');
  }

  async extractFromText(text: string, schema: JsonSchema) {
    return this.executeWithRetry(async () => {
      const schemaText = JSON.stringify(schema, null, 2);
      
      const prompt = `Você é um assistente especializado em extração de dados estruturados. Analise o texto fornecido e extraia as informações de acordo com o schema JSON especificado.

IMPORTANTE: Retorne APENAS um objeto JSON válido que corresponda exatamente ao schema fornecido. Não inclua explicações, comentários ou texto adicional.

Schema JSON:
${schemaText}

Texto para analisar:
${text}

JSON extraído:`;

      const messages = [
        {
          role: ConversationRole.USER,
          content: [
            {
              text: prompt
            }
          ]
        }
      ] as any;

      const start = performance.now();
      
      const command = new ConverseCommand({
        modelId: this.modelId,
        messages,
        inferenceConfig: {
          maxTokens: 4096,
          temperature: 0.1,
          topP: 0.9,
        },
      });

      const bedrockResponse = await this.client.send(command);
      
      const end = performance.now();

      // Extract response text
      const responseText = bedrockResponse.output?.message?.content?.[0]?.text || '';

      // Try to parse JSON from response
      let json;
      try {
        // Multiple strategies to extract JSON from the response
        let jsonString = '';
        
        // Strategy 1: Look for JSON between first { and last }
        const firstBrace = responseText.indexOf('{');
        const lastBrace = responseText.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonString = responseText.substring(firstBrace, lastBrace + 1);
        }
        
        // Strategy 2: If strategy 1 failed, try to find balanced braces
        if (!jsonString) {
          let braceCount = 0;
          let startIndex = -1;
          let endIndex = -1;
          
          for (let i = 0; i < responseText.length; i++) {
            if (responseText[i] === '{') {
              if (braceCount === 0) {
                startIndex = i;
              }
              braceCount++;
            } else if (responseText[i] === '}') {
              braceCount--;
              if (braceCount === 0 && startIndex !== -1) {
                endIndex = i;
                break;
              }
            }
          }
          
          if (startIndex !== -1 && endIndex !== -1) {
            jsonString = responseText.substring(startIndex, endIndex + 1);
          }
        }
        
        // Strategy 3: Try regex approach
        if (!jsonString) {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          jsonString = jsonMatch ? jsonMatch[0] : '';
        }
        
        if (!jsonString) {
          throw new Error('No valid JSON object found in response');
        }
        
        json = JSON.parse(jsonString);
      } catch (parseError) {
        console.warn('Failed to parse JSON from Mistral response:', responseText);
        throw new Error(`Invalid JSON response: ${parseError.message}`);
      }

      // Get token usage
      const estimatedInputTokens = bedrockResponse.usage?.inputTokens || 0;
      const estimatedOutputTokens = bedrockResponse.usage?.outputTokens || 0;

      const inputCost = calculateTokenCost(this.model, 'input', estimatedInputTokens);
      const outputCost = calculateTokenCost(this.model, 'output', estimatedOutputTokens);

      return {
        json,
        usage: {
          duration: end - start,
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          totalTokens: estimatedInputTokens + estimatedOutputTokens,
          inputCost,
          outputCost,
          totalCost: inputCost + outputCost,
        },
      };
    }, 'Text Extraction');
  }

  async extractFromImage(imagePath: string, schema: JsonSchema): Promise<{
    json: Record<string, any>;
    usage: Usage;
  }> {
    // Mistral Mixtral não suporta processamento direto de imagem
    throw new Error('Mistral Mixtral-8x7b-instruct-v0:1 does not support direct image processing. Use extractFromText instead with pre-processed OCR text.');
  }
} 