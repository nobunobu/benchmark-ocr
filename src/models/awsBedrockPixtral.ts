import { BedrockRuntimeClient, ConverseCommand, ConversationRole } from '@aws-sdk/client-bedrock-runtime';
import { ModelProvider } from './base';
import { JsonSchema } from '../types';
import { calculateTokenCost } from './shared/tokenCost';

// AWS Bedrock pricing for Pixtral models 
// Costs are now centralized in tokenCost.ts

// Retry configuration for handling throttling
const MAX_RETRIES = 5;
const BASE_DELAY = 2000; // Base delay in milliseconds
const MAX_DELAY = 60000; // Maximum delay in milliseconds

export class AWSBedrockPixtralProvider extends ModelProvider {
  private client: BedrockRuntimeClient;
  private inferenceProfileId: string;

  constructor(model: string) {
    super(model);
    
    // Get the inference profile ID from environment
    this.inferenceProfileId = process.env.AWS_BEDROCK_INFERENCE_PROFILE_PIXTRAL || '';
    
    if (!this.inferenceProfileId) {
      throw new Error('AWS_BEDROCK_INFERENCE_PROFILE_PIXTRAL environment variable is required for Pixtral models');
    }

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

  async ocr(imagePath: string) {
    return this.executeWithRetry(async () => {
      // For OCR, we need to convert image to base64 and send it with a prompt
      const imageResponse = await fetch(imagePath);
      const arrayBuffer = await imageResponse.arrayBuffer();
      const imageBytes = new Uint8Array(arrayBuffer);
      
      // Determine image format
      const imageFormat = imagePath.toLowerCase().includes('.png') ? 'png' : 'jpeg';

      const messages = [
        {
          role: ConversationRole.USER,
          content: [
            {
              text: "Please extract all text from this image and format it as markdown. Be precise and maintain the original structure and formatting as much as possible."
            },
            {
              image: {
                format: imageFormat,
                source: {
                  bytes: imageBytes
                }
              }
            }
          ]
        }
      ] as any;

      const start = performance.now();
      
      const command = new ConverseCommand({
        modelId: this.inferenceProfileId,
        messages,
        inferenceConfig: {
          maxTokens: 4096,
          temperature: 0.1,
          topP: 0.9,
        },
      });

      const bedrockResponse = await this.client.send(command);
      
      const end = performance.now();

      // Extract text from response
      const text = bedrockResponse.output?.message?.content?.[0]?.text || '';

      // Estimate token usage
      const estimatedInputTokens = bedrockResponse.usage?.inputTokens || 0;
      const estimatedOutputTokens = bedrockResponse.usage?.outputTokens || 0;

      const inputCost = calculateTokenCost(this.model, 'input', estimatedInputTokens);
      const outputCost = calculateTokenCost(this.model, 'output', estimatedOutputTokens);

      return {
        text,
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
    }, 'OCR');
  }

  async extractFromText(text: string, schema: JsonSchema) {
    return this.executeWithRetry(async () => {
      const schemaText = JSON.stringify(schema, null, 2);
      
      const prompt = `Extract information from the following text and return ONLY a valid JSON object that matches the provided schema. Do not include any explanations, comments, or additional text. Return only the JSON.

JSON Schema:
${schemaText}

Text to extract from:
${text}

JSON:`;

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
        modelId: this.inferenceProfileId,
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
        
        // Strategy 1: Look for JSON between first { and first }
        const firstBrace = responseText.indexOf('{');
        if (firstBrace !== -1) {
          let braceCount = 0;
          let endIndex = firstBrace;
          
          for (let i = firstBrace; i < responseText.length; i++) {
            if (responseText[i] === '{') {
              braceCount++;
            } else if (responseText[i] === '}') {
              braceCount--;
              if (braceCount === 0) {
                endIndex = i;
                break;
              }
            }
          }
          
          if (braceCount === 0) {
            jsonString = responseText.substring(firstBrace, endIndex + 1);
          }
        }
        
        // Strategy 2: If strategy 1 failed, try regex approach
        if (!jsonString) {
          const jsonMatch = responseText.match(/\{[^}]*\}/);
          jsonString = jsonMatch ? jsonMatch[0] : '';
        }
        
        // Strategy 3: If still no JSON, try to find any object-like structure
        if (!jsonString) {
          const lines = responseText.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('{') && trimmed.includes('}')) {
              jsonString = trimmed;
              break;
            }
          }
        }
        
        if (!jsonString) {
          throw new Error('No valid JSON object found in response');
        }
        
        json = JSON.parse(jsonString);
      } catch (parseError) {
        console.warn('Failed to parse JSON from Pixtral response:', responseText);
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

  async extractFromImage(imagePath: string, schema: JsonSchema) {
    return this.executeWithRetry(async () => {
      // For direct image extraction, combine image and schema in one call
      const imageResponse = await fetch(imagePath);
      const arrayBuffer = await imageResponse.arrayBuffer();
      const imageBytes = new Uint8Array(arrayBuffer);
      
      // Determine image format
      const imageFormat = imagePath.toLowerCase().includes('.png') ? 'png' : 'jpeg';
      
      const schemaText = JSON.stringify(schema, null, 2);

      const prompt = `Analyze this image and extract information according to the provided JSON schema. Return ONLY a valid JSON object that matches the schema. Do not include any explanations, comments, or additional text. Return only the JSON.

JSON Schema:
${schemaText}

JSON:`;

      const messages = [
        {
          role: ConversationRole.USER,
          content: [
            {
              text: prompt
            },
            {
              image: {
                format: imageFormat,
                source: {
                  bytes: imageBytes
                }
              }
            }
          ]
        }
      ] as any;

      const start = performance.now();
      
      const command = new ConverseCommand({
        modelId: this.inferenceProfileId,
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
        
        // Strategy 1: Look for JSON between first { and first }
        const firstBrace = responseText.indexOf('{');
        if (firstBrace !== -1) {
          let braceCount = 0;
          let endIndex = firstBrace;
          
          for (let i = firstBrace; i < responseText.length; i++) {
            if (responseText[i] === '{') {
              braceCount++;
            } else if (responseText[i] === '}') {
              braceCount--;
              if (braceCount === 0) {
                endIndex = i;
                break;
              }
            }
          }
          
          if (braceCount === 0) {
            jsonString = responseText.substring(firstBrace, endIndex + 1);
          }
        }
        
        // Strategy 2: If strategy 1 failed, try regex approach
        if (!jsonString) {
          const jsonMatch = responseText.match(/\{[^}]*\}/);
          jsonString = jsonMatch ? jsonMatch[0] : '';
        }
        
        // Strategy 3: If still no JSON, try to find any object-like structure
        if (!jsonString) {
          const lines = responseText.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('{') && trimmed.includes('}')) {
              jsonString = trimmed;
              break;
            }
          }
        }
        
        if (!jsonString) {
          throw new Error('No valid JSON object found in response');
        }
        
        json = JSON.parse(jsonString);
      } catch (parseError) {
        console.warn('Failed to parse JSON from Pixtral response:', responseText);
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
    }, 'Image Extraction');
  }
} 