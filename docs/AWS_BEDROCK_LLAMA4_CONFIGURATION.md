# AWS Bedrock Llama 4 Maverick Configuration

This guide explains how to configure and use Llama 4 Maverick models through AWS Bedrock in the OCR benchmark.

## Prerequisites

1. **AWS Account**: You need an AWS account with access to AWS Bedrock
2. **Bedrock Access**: Request access to Llama 4 Maverick models in your AWS Bedrock console
3. **Inference Profile**: Create an inference profile for Llama 4 Maverick in AWS Bedrock

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
3. Create a new inference profile for Llama 4 Maverick
4. Copy the ARN or ID of the inference profile

### 3. Configure Inference Profile ID

Add the inference profile ID to your `.env` file:

```bash
AWS_BEDROCK_INFERENCE_PROFILE_LLAMA4=arn:aws:bedrock:us-east-1:123456789012:inference-profile/llama4-maverick-profile
```

### 4. Update models.yaml

Add the Llama 4 Maverick configuration to your `models.yaml` file:

```yaml
models:
  # Llama 4 Maverick for both OCR and extraction
  - ocr: us.meta.llama4-maverick-17b-instruct-v1:0
    extraction: us.meta.llama4-maverick-17b-instruct-v1:0
    
  # Llama 4 Maverick with direct image extraction
  - ocr: us.meta.llama4-maverick-17b-instruct-v1:0
    extraction: us.meta.llama4-maverick-17b-instruct-v1:0
    directImageExtraction: true
```

## Implementation Details

### Payload Format

The implementation uses the Llama 4 specific payload format:

```json
{
  "prompt": "Your prompt here",
  "max_gen_len": 4096,
  "temperature": 0.1,
  "top_p": 0.9,
  "images": ["base64_encoded_image_string"]
}
```

**Important Notes**: 
- For Llama 4 Maverick, the `images` field should be an array of base64-encoded strings, not objects with format/source structure. This is different from other AWS Bedrock models.
- **Image Tokens Required**: When providing images, the prompt must include the `<image>` token to indicate where the image should be processed. Without this token, you'll get a ValidationException: "The number of image tokens (0) must be the same as the number of images (1)".

**Example prompt format with image**:
```
<image>

Please extract all text from this image and format it as markdown.
```

### Response Handling

The implementation handles multiple response formats from Llama 4:

- `generation`: Standard response field
- `generated_text`: Alternative response field
- `outputs[0].text`: Array-based response format

### Rate Limiting and Throttling

The default concurrency for Llama 4 Maverick is set to **1 concurrent request** to prevent throttling issues. The implementation includes:

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

You can test your Llama 4 Maverick configuration using the Ruby script provided as a reference:

1. Create a test Ruby script with your configuration
2. Run it to verify connectivity to AWS Bedrock
3. Check that the inference profile is working correctly

## Troubleshooting

### Common Issues

1. **Access Denied**: Ensure you have requested access to Llama 4 models in AWS Bedrock console
2. **Invalid Inference Profile**: Verify the inference profile ARN/ID is correct
3. **Region Mismatch**: Ensure your AWS region matches where the inference profile was created
4. **Credentials Issues**: Verify your AWS credentials have the necessary permissions
5. **Throttling (HTTP 429)**: The implementation automatically handles throttling with exponential backoff, but if you see persistent throttling:
   - Reduce concurrency to 1 (already the default)
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
        "bedrock:GetInferenceProfile"
      ],
      "Resource": "*"
    }
  ]
}
```

## Performance Considerations

- **Cost**: Monitor your AWS Bedrock usage as costs can vary by model and region
- **Latency**: Llama 4 Maverick may have higher latency compared to other models
- **Rate Limits**: Be aware of AWS Bedrock rate limits for your account

## Example Configuration

Complete `.env` file example:

```bash
# AWS Bedrock Configuration
AWS_BEDROCK_INFERENCE_PROFILE_LLAMA4=arn:aws:bedrock:us-east-1:123456789012:inference-profile/llama4-maverick
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
  - ocr: us.meta.llama4-maverick-17b-instruct-v1:0
    extraction: us.meta.llama4-maverick-17b-instruct-v1:0
    
  # Direct image to JSON extraction
  - ocr: us.meta.llama4-maverick-17b-instruct-v1:0
    extraction: us.meta.llama4-maverick-17b-instruct-v1:0
    directImageExtraction: true
``` 