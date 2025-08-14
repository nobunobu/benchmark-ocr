#!/bin/bash

# ==============================================================================
# Script para processar PDFs em subdiretórios (Compatível com ImageMagick v7+):
# - Para cada subdiretório:
#   - Concatena todas as páginas de todos os PDFs encontrados nele em uma única imagem JPG.
#   - Nomeia o JPG com o nome do subdiretório.
#   - Faz o upload do JPG para AWS S3, mantendo a estrutura de prefixo.
# - Melhorado para lidar com nomes de arquivos contendo espaços e garantir
#   que a lógica de contagem e sucesso funcione corretamente.
# - Gera lista de downloads no final do processamento.
# ==============================================================================

# --- Configurações ---
BASE_DIR="./data/senhas"          # Pasta base que contém os subdiretórios com PDFs
OUTPUT_QUALITY="90"               # Qualidade do JPG (0-100)
IMAGE_DENSITY="300"               # Resolução (DPI) para rasterizar PDFs (ex: 150, 300)

AWS_S3_BUCKET="superdoc-app" # Nome do seu bucket S3 (EX: meus-documentos-processados)
AWS_S3_BASE_PREFIX="clients/" # Prefixo base dentro do bucket S3 para uploads
# ATENÇÃO: As credenciais da AWS devem ser configuradas via `aws configure` ou variáveis de ambiente.

# Array para armazenar os URLs dos arquivos enviados
declare -a UPLOADED_FILES_URLS=()
declare -a UPLOADED_FILES_NAMES=()

# --- Verificações de Pré-requisitos ---
echo "========================================"
echo "Verificando pré-requisitos..."

command -v magick >/dev/null 2>&1 || { echo >&2 "Erro: ImageMagick (magick) não está instalado. Abortando."; exit 1; }
command -v gs >/dev/null 2>&1 || { echo >&2 "Erro: Ghostscript (gs) não está instalado. É necessário para ImageMagick processar PDFs. Abortando."; exit 1; }
command -v aws >/dev/null 2>&1 || { echo >&2 "Erro: AWS CLI não está instalado ou configurado. Abortando."; exit 1; }

if [ ! -d "$BASE_DIR" ]; then
    echo "Erro: A pasta base '$BASE_DIR' não existe. Por favor, crie-a ou ajuste a variável BASE_DIR."
    exit 1
fi

echo "Pré-requisitos verificados com sucesso."
echo "========================================"

# --- Processar cada subdiretório ---
# Encontra todos os subdiretórios diretamente abaixo de BASE_DIR
SUBDIRS=$(find "$BASE_DIR" -maxdepth 1 -type d -not -path "$BASE_DIR" | sort)

if [ -z "$SUBDIRS" ]; then
    echo "Nenhum subdiretório encontrado em '$BASE_DIR'. Nada para processar."
    exit 0
fi

echo "Subdiretórios a serem processados:"
echo "$SUBDIRS" | sed 's|^|  - |'
echo "========================================"

for SUBDIR_PATH in $SUBDIRS; do
    SUBDIR_NAME=$(basename "$SUBDIR_PATH") # Obtém apenas o nome do subdiretório
    OUTPUT_JPG_FILENAME="${SUBDIR_NAME}.jpg" # Nome do arquivo JPG de saída
    FULL_OUTPUT_JPG_PATH="${SUBDIR_PATH}/${OUTPUT_JPG_FILENAME}" # Caminho completo para o JPG

    echo ""
    echo "--- Processando subdiretório: $SUBDIR_NAME ---"

    # Encontrar todos os PDFs neste subdiretório (case-insensitive para .pdf/.PDF)
    # e armazená-los em um array para iterar de forma segura.
    # Usamos `readarray` (ou `mapfile` para Bash 4+) para carregar a saída do find para um array.
    PDF_FILES_ARRAY=()
    while IFS= read -r line; do
        PDF_FILES_ARRAY+=("$line")
    done < <(find "$SUBDIR_PATH" -maxdepth 1 -type f -iname "*.pdf" | sort)

    if [ ${#PDF_FILES_ARRAY[@]} -eq 0 ]; then
        echo "Nenhum arquivo PDF encontrado em '$SUBDIR_PATH'. Pulando este subdiretório."
        continue # Pula para o próximo subdiretório
    fi

    echo "PDFs encontrados em '$SUBDIR_NAME':"
    for pdf_file_info in "${PDF_FILES_ARRAY[@]}"; do
        echo "  - $pdf_file_info"
    done

    # Criar um diretório temporário para as páginas extraídas
    TEMP_PAGES_DIR=$(mktemp -d -t pdf_pages_XXXXXX)
    if [ $? -ne 0 ]; then
        echo "Erro ao criar diretório temporário para $SUBDIR_NAME. Pulando."
        continue
    fi
    echo "Diretório temporário para páginas: $TEMP_PAGES_DIR"

    PAGE_COUNTER=0 # Contador global de páginas para garantir nomes únicos e ordem
    CONVERSION_SUCCESS=true

    # Converter cada PDF do subdiretório em imagens temporárias
    for PDF_FILE in "${PDF_FILES_ARRAY[@]}"; do
        echo "  - Convertendo PDF: $PDF_FILE"
        
        magick -density "$IMAGE_DENSITY" "$PDF_FILE" \
                -quality "$OUTPUT_QUALITY" \
                -alpha remove \
                "$TEMP_PAGES_DIR/page_$(printf "%04d" $PAGE_COUNTER)_%02d.jpg"

        if [ $? -ne 0 ]; then
            echo "    Erro ao converter $PDF_FILE. Este subdiretório será ignorado."
            CONVERSION_SUCCESS=false
            break # Sai do loop de PDFs
        fi
        # Atualiza o contador de páginas para o próximo PDF
        PAGE_COUNTER=$((PAGE_COUNTER + $(ls "$TEMP_PAGES_DIR"/page_$(printf "%04d" $PAGE_COUNTER)_*.jpg 2>/dev/null | wc -l)))
    done

    # Se a conversão de algum PDF falhou
    if [ "$CONVERSION_SUCCESS" = false ]; then
        rm -rf "$TEMP_PAGES_DIR" # Limpa o diretório temp antes de pular
        continue # Pula para o próximo subdiretório principal
    fi

    # Concatenar todas as imagens JPG temporárias em uma única imagem JPG verticalmente
    echo "  - Concatenando todas as páginas em '$FULL_OUTPUT_JPG_PATH'..."
    
    # Verifica se existem páginas temporárias para concatenar
    if [ -z "$(ls -A "$TEMP_PAGES_DIR"/page_*.jpg 2>/dev/null)" ]; then
        echo "    Nenhuma página JPG temporária encontrada para concatenar em '$SUBDIR_NAME'. Possível erro anterior."
        rm -rf "$TEMP_PAGES_DIR"
        continue
    fi

    magick "$TEMP_PAGES_DIR"/page_*.jpg -append -quality "$OUTPUT_QUALITY" "$FULL_OUTPUT_JPG_PATH"

    if [ $? -ne 0 ]; then
        echo "    Erro ao concatenar imagens para '$SUBDIR_NAME'. Este subdiretório será ignorado."
        rm -rf "$TEMP_PAGES_DIR"
        continue # Pula para o próximo subdiretório principal
    fi

    echo "  - Arquivo JPG concatenado criado com sucesso: $FULL_OUTPUT_JPG_PATH"

    # --- Upload para AWS S3 ---
    echo "  - Iniciando upload de '$OUTPUT_JPG_FILENAME' para o S3..."
    AWS_S3_DESTINATION="s3://${AWS_S3_BUCKET}/${AWS_S3_BASE_PREFIX}${SUBDIR_NAME}/${OUTPUT_JPG_FILENAME}"

    aws s3 cp "$FULL_OUTPUT_JPG_PATH" "$AWS_S3_DESTINATION"

    if [ $? -ne 0 ]; then
        echo "    Erro no upload para o S3 de '$SUBDIR_NAME'. Verifique suas credenciais e permissões."
        # Não aborta o script inteiro, apenas este subdiretório
    else
        echo "    Upload concluído com sucesso para: $AWS_S3_DESTINATION"
        
        # Armazenar informações do arquivo enviado para a lista de downloads
        S3_HTTP_URL="https://${AWS_S3_BUCKET}.s3.amazonaws.com/${AWS_S3_BASE_PREFIX}${SUBDIR_NAME}/${OUTPUT_JPG_FILENAME}"
        UPLOADED_FILES_URLS+=("$S3_HTTP_URL")
        UPLOADED_FILES_NAMES+=("$SUBDIR_NAME")
    fi

    # --- Limpeza ---
    rm -rf "$TEMP_PAGES_DIR"
    echo "--- Processamento de '$SUBDIR_NAME' concluído. ---"

done

echo ""
echo "========================================"
echo "Script finalizado: Todos os subdiretórios foram processados."
echo "========================================"

# --- Lista de Downloads ---
if [ ${#UPLOADED_FILES_URLS[@]} -gt 0 ]; then
    echo ""
    echo "📁 LISTA DE ARQUIVOS DISPONÍVEIS PARA DOWNLOAD:"
    echo "========================================"
    
    for i in "${!UPLOADED_FILES_URLS[@]}"; do
        SUBDIR_NAME="${UPLOADED_FILES_NAMES[$i]}"
        FILE_URL="${UPLOADED_FILES_URLS[$i]}"
        
        echo "📄 ${SUBDIR_NAME}.jpg"
        echo "   🔗 URL Direta: ${FILE_URL}"
        
        # Gerar URL assinada para download (válida por 1 hora)
        echo -n "   🔐 URL Assinada (2h): "
        PRESIGNED_URL=$(aws s3 presign "${FILE_URL/https:\/\/${AWS_S3_BUCKET}.s3.amazonaws.com\//s3://${AWS_S3_BUCKET}/}" --expires-in 7200 2>/dev/null)
        if [ $? -eq 0 ] && [ -n "$PRESIGNED_URL" ]; then
            echo "$PRESIGNED_URL"
        else
            echo "Erro ao gerar URL assinada"
        fi
        echo ""
    done
    
    echo "========================================"
    echo "📊 Total de arquivos processados: ${#UPLOADED_FILES_URLS[@]}"
    echo ""
    echo "💡 INSTRUÇÕES:"
    echo "   • URLs Diretas: Use se o bucket S3 for público"
    echo "   • URLs Assinadas: Use para buckets privados (válidas por 1 hora)"
    echo "   • Para novas URLs assinadas, execute:"
    echo "     aws s3 presign s3://${AWS_S3_BUCKET}/${AWS_S3_BASE_PREFIX}<subdir>/<arquivo>.jpg --expires-in 3600"
    echo "========================================"
else
    echo ""
    echo "⚠️  Nenhum arquivo foi enviado com sucesso para o S3."
    echo "   Verifique os logs acima para identificar possíveis problemas."
fi