# Google Sheets Dashboard Setup

## 1. Create Google Sheet

1. Acesse [sheets.google.com](https://sheets.google.com)
2. Crie uma nova planilha: "Shadowfall Vitals"
3. Na primeira linha (cabeçalho), adicione:
   ```
   timestamp | name | value | rating | delta | id | page | userAgent
   ```
   (Use `Inserir > Linha acima` se necessário)

## 2. Create Apps Script

1. Na planilha: **Extensões > Apps Script**
2. Apague o código padrão e cole:

```javascript
function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);

    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.name,
      data.value,
      data.rating || 'unknown',
      data.delta || 0,
      data.id || '',
      data.page || '/',
      data.userAgent || 'unknown',
    ]);

    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    console.error('Apps Script error:', err);
    return ContentService.createTextOutput('ERROR: ' + err.message).setMimeType(
      ContentService.MimeType.TEXT
    );
  }
}
```

3. **Arquivo > Salvar** (dê um nome: "Shadowfall Vitals Collector")
4. **Implantar > Nova implantação**
   - Tipo: **Aplicativo da Web**
   - Executar como: **Eu** (seu email)
   - Quem tem acesso: **Qualquer pessoa**
   - Clique **Implantar**
5. **Copie a URL do aplicativo da Web** (algo como `https://script.google.com/macros/s/AKfycbx.../exec`)

## 3. Configure Vercel Environment Variable

1. No dashboard da Vercel: **Project > Settings > Environment Variables**
2. Adicione:
   - Name: `VITALS_SHEETS_URL`
   - Value: `https://script.google.com/macros/s/SEU_ID_AQUI/exec`
   - Environments: **Production**, **Preview**, **Development** (todos)
3. **Save**
4. Faça um novo deploy: `vercel --prod` ou push para `main`

## 4. Test

```bash
# Local test (precisa rodar o servidor)
npm run dev
# Abra http://localhost:5173, jogue um pouco
# Verifique a planilha - deve aparecer linhas novas
```

## 5. Query Examples (na própria planilha)

**Médias por métrica:**

```excel
=QUERY(A:H, "SELECT B, AVG(C) WHERE B IS NOT NULL GROUP BY B LABEL AVG(C) 'Média'")
```

**P95 por página:**

```excel
=QUERY(A:H, "SELECT G, PERCENTILE(C, 0.95) WHERE C IS NOT NULL GROUP BY G")
```

**INP ao longo do tempo:**

```excel
=QUERY(A:H, "SELECT A, C WHERE B = 'INP' ORDER BY A DESC LIMIT 100")
```

**Taxa de "poor" ratings:**

```excel
=QUERY(A:H, "SELECT B, COUNT(C) WHERE D = 'poor' GROUP BY B")
```

## Limites do Google Apps Script

- **Execuções/dia**: 30.000 (conta gratuita)
- **Duração máx.**: 6 min/execução
- **Trigger**: HTTPS POST apenas (compatível com `sendBeacon`)

Para jogos pequenos (<1000 sessões/dia), está bem dentro dos limites.
