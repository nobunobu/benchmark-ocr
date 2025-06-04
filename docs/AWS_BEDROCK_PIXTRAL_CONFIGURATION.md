# AWS Bedrock Pixtral Configuration

This guide explains how to configure and use Pixtral models through AWS Bedrock in the OCR benchmark.

## Prerequisites

1. **AWS Account**: You need an AWS account with access to AWS Bedrock
2. **Bedrock Access**: Request access to Pixtral models in your AWS Bedrock console
3. **Inference Profile**: Create an inference profile for Pixtral in AWS Bedrock

## Configuration Steps

### 1. Set up AWS Credentials

Configure your AWS credentials in your `.env` file:

```bash
AWS_ACCESS_KEY_ID=your_aws_access_key_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_key_here
AWS_REGION=us-east-1
```

### 2. Create Inference Profile

1. Go to the AWS Bedrock console
2. Navigate to "Inference profiles"
3. Create a new inference profile for Pixtral
4. Copy the ARN or ID of the inference profile

### 3. Configure Inference Profile ID

Add the inference profile ID to your `.env` file:

```bash
AWS_BEDROCK_INFERENCE_PROFILE_PIXTRAL=arn:aws:bedrock:us-east-1:123456789012:inference-profile/pixtral-profile
```

### 4. Update models.yaml

Add the Pixtral configuration to your `models.yaml` file:

```yaml
models:
  # Pixtral for both OCR and extraction
  - ocr: pixtral-12b-v1
    extraction: pixtral-12b-v1
    
  # Pixtral Instruct with direct image extraction
  - ocr: pixtral-12b-instruct-v1
    extraction: pixtral-12b-instruct-v1
    directImageExtraction: true
```

## Implementation Details

### Model Architecture

Pixtral models are optimized for vision-language tasks and support:
- High-quality OCR extraction
- Structured data extraction to JSON
- Multi-modal understanding combining text and images
- Various image formats (PNG, JPEG)

### Payload Format

The implementation uses the AWS Bedrock Converse API format:

```json
{
  "modelId": "inference-profile-id",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "text": "Your prompt here"
        },
        {
          "image": {
            "format": "png",
            "source": {
              "bytes": "base64_encoded_image_bytes"
            }
          }
        }
      ]
    }
  ],
  "inferenceConfig": {
    "maxTokens": 4096,
    "temperature": 0.1,
    "topP": 0.9
  }
}
```

### Response Handling

The implementation includes robust JSON parsing with multiple strategies:

1. **Primary Strategy**: Balanced brace matching to extract complete JSON objects
2. **Fallback Strategy**: Regex pattern matching for simple JSON structures
3. **Final Strategy**: Line-by-line search for JSON-like structures

### Rate Limiting and Throttling

The default concurrency for Pixtral is set to prevent throttling issues. The implementation includes:

- **Exponential Backoff**: Automatic retry with increasing delays (1s, 2s, 4s, 8s, 16s, up to 30s max)
- **Throttling Detection**: Automatically detects `ThrottlingException` (HTTP 429) and retries
- **Maximum Retries**: Up to 5 retry attempts before failing
- **Intelligent Retry**: Only retries on throttling errors, not on other types of errors

### Retry Configuration

```typescript
const MAX_RETRIES = 5;
const BASE_DELAY = 1000; // Base delay in milliseconds
const MAX_DELAY = 30000; // Maximum delay in milliseconds
```

When throttling occurs, you'll see messages like:
```
🚫 OCR: Throttled, will retry (attempt 1/6)
⏳ OCR: Retry attempt 1/5 after 1000ms delay...
```

## Testing the Configuration

You can test your Pixtral configuration by running:

```bash
npm run test-pixtral
```

This will verify:
1. AWS credentials are properly configured
2. Inference profile is accessible
3. Pixtral model responds correctly to test queries

## Troubleshooting

### Common Issues

1. **Access Denied**: Ensure you have requested access to Pixtral models in AWS Bedrock console
2. **Invalid Inference Profile**: Verify the inference profile ARN/ID is correct
3. **Region Mismatch**: Ensure your AWS region matches where the inference profile was created
4. **Credentials Issues**: Verify your AWS credentials have the necessary permissions
5. **Throttling (HTTP 429)**: The implementation automatically handles throttling with exponential backoff, but if you see persistent throttling:
   - Check your AWS Bedrock quota limits
   - Consider requesting quota increases if needed
   - Monitor your account's overall Bedrock usage

### Required Permissions

Your AWS credentials need the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:Converse",
        "bedrock:GetInferenceProfile"
      ],
      "Resource": "*"
    }
  ]
}
```

## Performance Considerations

- **Cost**: Monitor your AWS Bedrock usage as costs can vary by model and region
- **Latency**: Pixtral models are optimized for vision tasks and should provide good performance
- **Rate Limits**: Be aware of AWS Bedrock rate limits for your account
- **Image Size**: Larger images may impact processing time and costs

## Supported Features

| Feature | Support | Notes |
|---------|---------|-------|
| OCR | ✅ | High-quality text extraction |
| JSON Extraction | ✅ | Structured data extraction |
| Direct Image Extraction | ✅ | Single-step image to JSON |
| Multiple Image Formats | ✅ | PNG, JPEG supported |
| Retry Logic | ✅ | Automatic throttling handling |
| Cost Tracking | ✅ | Token usage and cost estimation |

## Example Configuration

Complete `.env` file example:

```bash
# AWS Bedrock Configuration
AWS_BEDROCK_INFERENCE_PROFILE_PIXTRAL=arn:aws:bedrock:us-east-1:123456789012:inference-profile/pixtral
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1

# Other API Keys (optional)
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
```

Complete `models.yaml` example:

```yaml
models:
  # Standard OCR + extraction pipeline
  - ocr: pixtral-12b-v1
    extraction: pixtral-12b-v1
    
  # Direct image to JSON extraction with Instruct model
  - ocr: pixtral-12b-instruct-v1
    extraction: pixtral-12b-instruct-v1
    directImageExtraction: true
    
  # Mixed pipeline: Pixtral OCR + GPT-4 extraction
  - ocr: pixtral-12b-v1
    extraction: gpt-4o
```

## Model Variants

### pixtral-12b-v1
- Base Pixtral model
- Optimized for general vision-language tasks
- Good balance of speed and accuracy

### pixtral-12b-instruct-v1
- Instruction-tuned variant
- Better at following specific formatting requirements
- Recommended for structured data extraction

## Best Practices

1. **Use Instruct Model**: For JSON extraction tasks, prefer `pixtral-12b-instruct-v1`
2. **Monitor Costs**: Track token usage and adjust max_tokens as needed
3. **Image Quality**: Provide clear, high-resolution images for better OCR results
4. **Schema Design**: Design clear, specific JSON schemas for better extraction accuracy
5. **Error Handling**: The implementation includes robust error handling, but monitor logs for any issues 