[![Omni OCR Benchmark](https://omniai-images.s3.us-east-1.amazonaws.com/omni-ocr-benchmark.png)](https://getomni.ai/ocr-benchmark)

# Omni OCR Benchmark

A benchmarking tool that compares OCR and data extraction capabilities of different large multimodal models such as gpt-4o, evaluating both text and json extraction accuracy. The goal of this benchmark is to publish a comprehensive benchmark of OCRaccuracy across traditional OCR providers and multimodal Language Models. The evaluation dataset and methodologies are all Open Source, and we encourage expanding this benchmark to encompass any additional providers.

[**Open Source LLM Benchmark Results (Mar 2025)**](https://getomni.ai/blog/benchmarking-open-source-models-for-ocr) | [**Dataset**](https://huggingface.co/datasets/getomni-ai/ocr-benchmark)

[**Benchmark Results (Feb 2025)**](https://getomni.ai/ocr-benchmark) | [**Dataset**](https://huggingface.co/datasets/getomni-ai/ocr-benchmark)

![image](https://github.com/user-attachments/assets/2be179ad-0abd-4f0e-b73a-7d5a70390367)


## Methodology

The primary goal is to evaluate JSON extraction from documents. To evaluate this, the Omni benchmark runs <strong>Document ⇒ OCR ⇒ Extraction</strong>. Measuring how well a model can OCR a page, and return that content in a format that an LLM can parse.

![methodology](https://omniai-images.s3.us-east-1.amazonaws.com/methodology-diagram.png)

## Evaluation Metrics

### JSON accuracy

We use a modified [json-diff](https://github.com/zgrossbart/jdd) to identify differences between predicted and ground truth JSON objects. You can review the [evaluation/json.ts](./src/evaluation/json.ts) file to see the exact implementation. Accuracy is calculated as:

```math
\text{Accuracy} = 1 - \frac{\text{number of difference fields}}{\text{total fields}}
```

![json-diff](https://omniai-images.s3.us-east-1.amazonaws.com/json_accuracy.png)

### Text similarity

While the primary benchmark metric is JSON accuracy, we have included [levenshtein distance](https://en.wikipedia.org/wiki/Levenshtein_distance) as a measurement of text similarity between extracted and ground truth text.
Lower distance indicates higher similarity. Note this scoring method heavily penalizes accurate text that does not conform to the exact layout of the ground truth data.

In the example below, an LLM could decode both blocks of text without any issue. All the information is 100% accurate, but slight rearrangements of the header text (address, phone number, etc.) result in a large difference on edit distance scoring.

![text-similarity](https://omniai-images.s3.us-east-1.amazonaws.com/edit_distance.png)

## Running the benchmark

1. Clone the repo and install dependencies: `npm install`
2. Install ImageMagick in your operational system
3. Prepare your test data
   1. For local data, add individual files to the `data` folder.
   2. To pull from a DB, add `DATABASE_URL` in your `.env`
4. Copy the `models.example.yaml` file to `models.yaml`. Set up API keys in `.env` for the models you want to test. Check out the [supported models](#supported-models) here.
5. **For AWS Bedrock Llama 4 Maverick**: Test your connection first with `npm run test-llama4` (see [AWS Bedrock Configuration](./docs/AWS_BEDROCK_LLAMA4_CONFIGURATION.md))
6. **For AWS Bedrock Mistral Mixtral-8x7b**: Test your connection first with `npm run test-mistral` (see [AWS Bedrock Mistral Configuration](./docs/AWS_BEDROCK_MISTRAL_CONFIGURATION.md))
7. **For AWS Bedrock Pixtral**: Test your connection first with `npm run test-pixtral` (see [AWS Bedrock Pixtral Configuration](./docs/AWS_BEDROCK_PIXTRAL_CONFIGURATION.md))
8. Run the benchmark: `npm run benchmark`
9. Results will be saved in the `results/<timestamp>/results.json` file.

## Supported models

To enable specific models, create a `models.yaml` file in the `src` directory. Check out the [models.example.yaml](./src/models.example.yaml) file for the required variables.

```yaml
models:
  - ocr: gemini-2.0-flash-001 # The model to use for OCR
    extraction: gpt-4o # The model to use for JSON extraction

  - ocr: gpt-4o
    extraction: gpt-4o
    directImageExtraction: true # Whether to use the model's native image extraction capabilities
```

You can view configuration for each model in the [src/models/](./src/models/) folder.

### Closed-source LLMs

| Model Provider | Models                                                       | OCR | JSON Extraction | Required ENV Variables                                                                               |
| -------------- | ------------------------------------------------------------ | --- | --------------- | ---------------------------------------------------------------------------------------------------- |
| Anthropic      | `claude-3-5-sonnet-20241022`                                 | ✅  | ✅              | `ANTHROPIC_API_KEY`                                                                                  |
| OpenAI         | `gpt-4o`                                                     | ✅  | ✅              | `OPENAI_API_KEY`                                                                                     |
| Gemini         | `gemini-2.0-flash-001`, `gemini-1.5-pro`, `gemini-1.5-flash` | ✅  | ✅              | `GOOGLE_GENERATIVE_AI_API_KEY`                                                                       |
| Mistral        | `mistral-ocr`                                                | ✅  | ❌              | `MISTRAL_API_KEY`                                                                                    |
| OmniAI         | `omniai`                                                     | ✅  | ✅              | `OMNIAI_API_KEY`, `OMNIAI_API_URL`                                                                   |
| AWS Bedrock    | `us.meta.llama4-maverick-17b-instruct-v1:0`                 | ✅  | ✅              | `AWS_BEDROCK_INFERENCE_PROFILE_LLAMA4`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`  |
| AWS Bedrock Mistral | `mistral.mixtral-8x7b-instruct-v0:1`                   | ❌  | ✅              | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`                                           |
| AWS Bedrock Pixtal | `pixtral-12b-v1`, `pixtral-12b-instruct-v1`              | ✅  | ✅              | `AWS_BEDROCK_INFERENCE_PROFILE_PIXTRAL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`  |

### Open-source LLMs

| Model Provider | Models                                                       | OCR | JSON Extraction | Required ENV Variables |
| -------------- | ------------------------------------------------------------ | --- | --------------- | ---------------------- |
| Gemma 3        | `google/gemma-3-27b-it`                                      | ✅  | ❌              |                        |
| Qwen 2.5       | `qwen2.5-vl-32b-instruct`, `qwen2.5-vl-72b-instruct`        | ✅  | ❌              |                        |
| Llama 3.2      | `meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo`, `meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo` | ✅  | ❌              |                        |
| ZeroX          | `zerox`                                                      | ✅  | ✅              | `OPENAI_API_KEY`                                                                                     |

### Cloud OCR Providers

| Model Provider | Models                                                       | OCR | JSON Extraction | Required ENV Variables                                                                               |
| -------------- | ------------------------------------------------------------ | --- | --------------- | ---------------------------------------------------------------------------------------------------- |
| AWS            | `aws-text-extract`                                           | ✅  | ❌              | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`                                           |
| Azure          | `azure-document-intelligence`                                | ✅  | ❌              | `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`, `AZURE_DOCUMENT_INTELLIGENCE_KEY`                            |
| Google         | `google-document-ai`                                         | ✅  | ❌              | `GOOGLE_LOCATION`, `GOOGLE_PROJECT_ID`, `GOOGLE_PROCESSOR_ID`, `GOOGLE_APPLICATION_CREDENTIALS_PATH` |
| Unstructured   | `unstructured`                                               | ✅  | ❌              | `UNSTRUCTURED_API_KEY`                                                                               |

- LLMS are instructed to use the following [system prompts](./src/models/shared/prompt.ts) for OCR and JSON extraction.
- For Google Document AI, you need to include `google_credentials.json` in the `data` folder.

## Benchmark Dashboard

![dashboard](./assets/dashboard-gif.gif)

You can use benchmark dashboard to easily view the results of each test run. Check out the [dashboard documentation](dashboard/README.md) for more details.

## License

This project is licensed under the MIT License - see the LICENSE file for details.