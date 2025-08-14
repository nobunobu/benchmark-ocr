#!/bin/bash

# Use vazio "" para indicar ausência de valor
# 1º posição: ocr
# 2º posição: extraction
# 3º posição: directImageExtraction

# definição dos testes
models=(
  "claude-3-5-sonnet-20241022" "claude-3-5-sonnet-20241022"
  "claude-3-5-sonnet-20241022" "claude-3-5-sonnet-20241022" "true"
  "claude-3-5-sonnet-20241022" "gpt-4o"
  "claude-3-5-sonnet-20241022" "gpt-4o" "true"
  "claude-3-5-sonnet-20241022" "omniai"
  "claude-3-5-sonnet-20241022" "omniai" "true"
  "gpt-4o" "claude-3-5-sonnet-20241022"
  "gpt-4o" "claude-3-5-sonnet-20241022" "true"
  "gpt-4o" "gpt-4o"
  "gpt-4o" "gpt-4o" "true"
  "gpt-4o" "omniai"
  "gpt-4o" "omniai" "true"
  "omniai" "claude-3-5-sonnet-20241022"
  "omniai" "claude-3-5-sonnet-20241022" "true"
  "omniai" "gpt-4o"
  "omniai" "gpt-4o" "true"
  "omniai" "omniai"
  "omniai" "omniai" "true"
)

yaml_file="src/models.yaml"
num_campos=3
num_modelos=$(( ${#models[@]} / num_campos ))

echo "Iniciando o processo iterativo de benchmark..."

for ((i=0; i<$num_modelos; i++)); do
  echo "\n--- Iteração $((i + 1)) ---"

  ocr="${models[$((i * num_campos))]}"
  extraction="${models[$((i * num_campos + 1))]}"
  direct_image_extraction="${models[$((i * num_campos + 2))]}"

  echo "Atualizando arquivo YAML..."
  > "$yaml_file" # Limpa o conteúdo do arquivo

  echo "models:" >> "$yaml_file"
  echo "  - ocr: $ocr" >> "$yaml_file"
  echo "    extraction: $extraction" >> "$yaml_file"
  if [[ -n "$direct_image_extraction" ]]; then
    echo "    directImageExtraction: $(echo "$direct_image_extraction" | tr '[:upper:]' '[:lower:]')" >> "$yaml_file"
  fi

  echo "Arquivo '$yaml_file' atualizado para o modelo: ocr=$ocr, extraction=$extraction, directImageExtraction=$direct_image_extraction"

#   echo "Rodando 'npm run benchmark'..."
#   if ! npm run benchmark; then
#     echo "Erro ao executar 'npm run benchmark' na iteração $((i + 1)). Interrompendo."
#     exit 1
#   fi
done

echo "\nProcesso iterativo de benchmark concluído."