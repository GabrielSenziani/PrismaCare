<h1 align="center">
  <br>
  <img src="./assets/logo.png" alt="PrismaCare" width="120">
  <br>
  PrismaCare
  <br>
</h1>

<p align="center">
  Plataforma de gerenciamento de medicamentos para idosos — agendamentos, confirmações de dose e alertas automáticos para cuidadores.
</p>

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.13-3776AB?style=flat-square&logo=python&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.136-009688?style=flat-square&logo=fastapi&logoColor=white">
  <img alt="React Native" src="https://img.shields.io/badge/React_Native-0.81-61DAFB?style=flat-square&logo=react&logoColor=black">
  <img alt="Expo" src="https://img.shields.io/badge/Expo-54-000020?style=flat-square&logo=expo&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green?style=flat-square">
</p>

---

## Sobre o projeto

O PrismaCare é um sistema acadêmico voltado ao gerenciamento de medicamentos, pensado principalmente para idosos. O usuário cadastra seus remédios, define horários de uso e recebe lembretes automáticos. Se uma dose não for confirmada dentro do prazo, o sistema notifica os contatos de segurança (familiares ou cuidadores) via WhatsApp.

**Stack principal:**

| Camada | Tecnologia |
|---|---|
| API | FastAPI + Uvicorn |
| Banco de dados | SQLite |
| Autenticação | JWT (access + refresh com rotação) |
| Agendamento | APScheduler |
| Validação | Pydantic v2 |
| Mobile | React Native + Expo |
| Linguagem mobile | TypeScript (strict) |
| Navegação | React Navigation v7 (com deep linking) |
| Push notifications | Expo Notifications |
| Testes | pytest + FastAPI TestClient |
| Infraestrutura | Docker + Nginx + SSL (Let's Encrypt) |

---

## Funcionalidades

- **Três fluxos de autenticação**: e-mail/senha, Google Sign-In (Android dev build) e telefone com OTP via WhatsApp
- **Onboarding** dedicado: tela de introdução, escolha de fluxo, confirmação de fuso horário e perfil
- **CRUD completo** de medicamentos, agendamentos, contatos de segurança e confirmações de dose
- **Recorrência flexível** de agendamentos: diária, por dias da semana ou data específica, com múltiplos horários
- **Geração automática de confirmações** ao consultar `/api/doses/hoje` e histórico paginável por período
- **Monitor automático (APScheduler)**: doses não confirmadas após a tolerância configurada são marcadas como `NAO_CONFIRMADO`, geram notificação WhatsApp para os contatos e push remoto opcional para o próprio usuário
- **WhatsApp provider configurável**: simulação local ou Evolution API
- **Push notifications via Expo**: registro de tokens por dispositivo, envio remoto para doses atrasadas e deduplicação por confirmação+token
- **Deep linking** para confirmação de dose direto da notificação
- **Isolamento total** de dados por usuário autenticado (validação ownership em todas as rotas)
- **Auditoria estruturada** de eventos de autenticação sem expor segredos

---

## Estrutura do projeto

```
PrismaCare/
│
├── app/                          # Backend Python / FastAPI
│   ├── main.py                   # Entry point, routers, lifespan, APScheduler
│   ├── database.py               # Conexão SQLite e criação do schema
│   ├── security.py               # JWT, bcrypt, dependency injection
│   │
│   ├── core/
│   │   ├── config.py             # Settings carregadas do .env (com TRUST_PROXY_HEADERS, lockouts, etc.)
│   │   ├── constants.py          # Enums de status (PENDENTE, CONFIRMADO, etc.)
│   │   ├── audit.py              # Log de eventos de autenticação
│   │   ├── rate_limit.py         # Rate limiter por IP e usuário
│   │   ├── phone_auth.py         # Normalização BR + geração/validação de OTP
│   │   └── security_controls.py  # client_ip (X-Real-IP), rate-limit enforcers
│   │
│   ├── middleware/
│   │   └── security_middleware.py # Headers (HSTS, COOP, Permissions-Policy), rate limit, auditoria 401/403
│   │
│   ├── routes/                   # Endpoints da API (um arquivo por domínio)
│   │   ├── auth_route.py         # /api/auth/* (login, google, telefone, refresh, logout)
│   │   ├── user_route.py         # /api/users/*
│   │   ├── medicamento_route.py  # /api/medicamentos/*
│   │   ├── contato_route.py      # /api/contatos/*
│   │   ├── agendamento_route.py  # /api/agendamentos/*
│   │   ├── dose_route.py         # /api/doses/hoje
│   │   ├── historico_route.py    # /api/doses/historico
│   │   ├── confirmacao_route.py  # /api/confirmacoes/*
│   │   ├── notificacao_route.py  # /api/notificacoes/*
│   │   ├── monitor_route.py      # /api/monitor/varredura (gated)
│   │   ├── whatsapp_route.py     # /api/whatsapp/* (status + test-send gated)
│   │   ├── push_token_route.py   # /api/push-tokens/* (registro/unregister)
│   │   └── client_log_route.py   # /api/client-logs (telemetria autenticada)
│   │
│   ├── repositories/             # Acesso ao banco (queries SQLite)
│   │   ├── auth_repo.py          # Tokens, eventos, lockout por (email,ip) e email-only
│   │   ├── user_repo.py
│   │   ├── medicamento_repo.py
│   │   ├── contato_repo.py
│   │   ├── agendamento_repo.py
│   │   ├── dose_repo.py
│   │   ├── historico_repo.py
│   │   ├── confirmacao_repo.py
│   │   ├── notificacao_repo.py
│   │   └── push_token_repo.py
│   │
│   ├── schemas/                  # Validação com Pydantic v2
│   │   ├── user_schema.py
│   │   ├── medicamento_schema.py
│   │   ├── contato_schema.py
│   │   ├── agendamento_schema.py
│   │   ├── dose_schema.py
│   │   ├── historico_schema.py
│   │   ├── confirmacao_schema.py
│   │   ├── notificacao_schema.py
│   │   ├── push_schema.py
│   │   └── whatsapp_schema.py
│   │
│   └── services/
│       ├── monitor_service.py            # varrer_e_notificar() — varredura de doses atrasadas
│       ├── whatsapp_service.py           # provider simulado / Evolution API
│       └── push_notification_service.py  # envio Expo Push para doses atrasadas
│
├── src/                          # Frontend React Native / Expo
│   ├── screens/
│   │   ├── AuthIntroScreen.tsx      # Tela inicial pré-login (escolha de fluxo)
│   │   ├── AuthEntryScreen.tsx      # Roteamento por e-mail (login vs. registro)
│   │   ├── LoginScreen.tsx
│   │   ├── RegisterScreen.tsx
│   │   ├── OnboardingScreen.tsx
│   │   ├── TimezoneWelcomeScreen.tsx
│   │   ├── ForgotPasswordScreen.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── MedicamentosScreen.tsx
│   │   ├── AgendamentosScreen.tsx
│   │   ├── ContatosScreen.tsx
│   │   └── DosesScreen.tsx
│   │
│   ├── components/                # Inputs, botões e componentes reutilizáveis
│   ├── contexts/                  # AuthContext (signIn / signOut / refresh)
│   ├── services/
│   │   ├── api.ts                 # Cliente HTTP com Bearer + refresh automático
│   │   ├── clientLog.ts           # Telemetria autenticada (best-effort)
│   │   ├── pushRegistrationService.ts
│   │   ├── notificationService.ts
│   │   ├── sessionStorage.ts
│   │   └── appPreferences.ts
│   ├── utils/                     # Helpers de timezone, telefone, Google Sign-In
│   └── theme/                     # Paleta de cores
│
├── tests/                        # Suíte pytest (incluindo regressão de segurança)
├── assets/                       # Ícones e imagens do app
├── App.tsx                       # Navegação principal (Stack Navigator)
├── index.ts                      # Entry point do Expo
├── docker-compose.yml            # Backend + Nginx em containers
├── Dockerfile                    # Imagem Python 3.13-slim
├── nginx.conf                    # Reverse proxy com SSL (Let's Encrypt)
├── requirements.txt              # Dependências Python
├── package.json                  # Dependências Node / Expo
├── tsconfig.json                 # TypeScript strict mode
└── .env.example                  # Variáveis de ambiente (template)
```

---

## Banco de dados

O schema é criado/migrado automaticamente na inicialização (`init_db`), incluindo migrações idempotentes para colunas adicionadas posteriormente.

**Domínio principal:**

```
users
 ├── medicamentos                (id_usuario → users.id)
 │    └── agendamentos           (id_medicamento → medicamentos.id)
 │         ├── agendamento_horarios   (múltiplos horários por agendamento)
 │         └── confirmacoes      (id_agendamento → agendamentos.id)
 │              └── notificacoes (id_confirmacao → confirmacoes.id, id_contato → contatos.id)
 ├── contatos                    (id_usuario → users.id)
 └── push_tokens                 (id_usuario → users.id)
       └── dose_overdue_push_attempts (id_confirmacao, id_push_token)
```

**Autenticação e segurança:**

```
users
 ├── refresh_tokens              (rotação com SHA-256 do token)
 ├── auth_events                 (auditoria de login/logout/refresh/blocked)
 └── phone_verification_codes    (OTP WhatsApp)

login_attempts                   (lockout por par email+ip)
login_attempts_email             (lockout email-only — defesa contra IP spoofing)
```

`users` contém ainda campos de auth social/telefone: `auth_provider`, `google_sub`, `avatar_url`, `phone_e164`, `phone_verified_at`, `timezone`, `timezone_confirmed`.

---

## Fluxo principal

```
Usuário cria conta
       ↓
   Faz login → recebe access token (15 min) + refresh token (14 dias)
       ↓
   Cadastra medicamento
       ↓
   Cria agendamento (horário + frequência + datas)
       ↓
   GET /api/doses/hoje → sistema gera confirmações PENDENTE automaticamente
       ↓
   Usuário confirma dose → status vira CONFIRMADO
       ↓
   Se não confirmada em 5 min → APScheduler marca como NAO_CONFIRMADO e dispara a notificação
       ↓
   Notificação gerada para contatos de segurança do usuário
```

---

## Endpoints da API

| Grupo | Método | Endpoint | Descrição |
|---|---|---|---|
| **Auth** | POST | `/api/auth/lookup-email` | Verifica se um e-mail está cadastrado (rate-limited) |
| | POST | `/api/auth/register` | Registro por e-mail/senha (senha forte obrigatória) |
| | POST | `/api/auth/login` | Login com e-mail e senha |
| | POST | `/api/auth/google` | Login com Google via `id_token` validado no backend |
| | POST | `/api/auth/lookup-phone` | Normaliza/valida telefone BR (não revela cadastro) |
| | POST | `/api/auth/send-phone-code` | Envia código OTP via WhatsApp (rate-limited por telefone) |
| | POST | `/api/auth/verify-phone-code` | Valida OTP e autentica ou libera cadastro por telefone |
| | POST | `/api/auth/complete-phone-registration` | Conclui cadastro novo com `verification_token` |
| | POST | `/api/auth/refresh` | Renova access token; revoga refresh anterior |
| | POST | `/api/auth/logout` | Revoga sessão atual |
| | POST | `/api/auth/logout-all` | Revoga todas as sessões do usuário |
| **Usuários** | POST | `/api/users` | Criar conta (público; valida força de senha) |
| | GET | `/api/users/me` | Perfil do usuário autenticado |
| | PATCH | `/api/users/me` | Atualizar nome |
| | PATCH | `/api/users/me/timezone` | Confirmar/alterar timezone IANA |
| | DELETE | `/api/users/{id}` | Deletar conta (apenas próprio usuário) |
| **Medicamentos** | GET/POST | `/api/medicamentos` | Listar / criar |
| | GET/PATCH/DELETE | `/api/medicamentos/{id}` | Buscar / atualizar / remover |
| **Contatos** | GET/POST | `/api/contatos` | Listar / criar |
| | GET/PATCH/DELETE | `/api/contatos/{id}` | Buscar / atualizar / remover |
| **Agendamentos** | GET/POST | `/api/agendamentos` | Listar / criar (com recorrência diária ou por dia da semana) |
| | GET/PATCH/DELETE | `/api/agendamentos/{id}` | Buscar / atualizar / remover |
| **Doses** | GET | `/api/doses/hoje` | Doses do dia com status (gera `PENDENTE` automaticamente) |
| | GET | `/api/doses/historico?data_inicio=&data_fim=` | Histórico por período (default: últimos 30 dias) |
| **Confirmações** | GET/POST | `/api/confirmacoes` | Listar / criar |
| | PUT | `/api/confirmacoes/{id}/confirmar` | Confirmar dose tomada |
| **Notificações** | GET/POST | `/api/notificacoes` | Listar / criar |
| **Push tokens** | POST | `/api/push-tokens` | Registrar token Expo do dispositivo |
| | POST | `/api/push-tokens/unregister` | Desativar token (logout/remoção) |
| **Monitor** | POST | `/api/monitor/varredura` | Disparar varredura manual (gated por `ENABLE_MANUAL_MONITOR_ENDPOINT`) |
| **WhatsApp** | GET | `/api/whatsapp/status` | Status sanitizado (nunca expõe `EVOLUTION_API_KEY`) |
| | POST | `/api/whatsapp/test-send` | Envio manual (gated por `ENABLE_WHATSAPP_TEST_ENDPOINT`) |
| **Telemetria** | POST | `/api/client-logs` | Logs do cliente autenticado (best-effort) |

Documentação interativa disponível em `/docs` (Swagger UI) após subir o backend.

---

## Segurança

### Autenticação
- **JWT**: access token (15 min) + refresh token (14 dias) com rotação a cada uso
- **bcrypt** para hash de senha (com salt aleatório)
- **Refresh token**: armazenado como SHA-256 no banco; revogação por sessão (`logout`) ou global (`logout-all`)
- **Política de senha forte** (registro): mínimo 8 caracteres com pelo menos uma letra e um número, mensagem unificada e centralizada
- **Google Sign-In**: backend valida `id_token`, `aud` e `email_verified` antes de aceitar
- **OTP por telefone**: código de 6 dígitos via WhatsApp, TTL de 5 minutos, hash do código armazenado, máximo de tentativas por código

### Lockout em camadas (defesa contra brute force e IP spoofing)
- **Lockout por par `(email, ip)`** — bloqueio progressivo após 5 falhas (15→60 min). Configurável via `LOGIN_LOCKOUT_*`.
- **Lockout por e-mail (email-only)** — defesa em profundidade contra ataques que rotacionam `X-Forwarded-For`. Threshold mais alto (default 20 falhas → 60 min). Configurável via `EMAIL_LOCKOUT_*`.

### Identificação correta do IP
- `client_ip()` prioriza `X-Real-IP` (setado pelo Nginx como `$remote_addr`, não spoofável) e cai no **último** elemento de `X-Forwarded-For` (anexado pelo proxy confiável) — nunca no primeiro elemento (controlado pelo cliente).
- `TRUST_PROXY_HEADERS=false` desliga essa lógica caso o app seja exposto direto à internet (extração só pelo socket).

### Rate limiting
- Login e refresh por IP e por usuário/e-mail
- `/api/auth/lookup-email` rate-limited para mitigar enumeração
- Envio e verificação de OTP têm limites próprios por telefone

### Headers de segurança (todas as respostas)
- `Strict-Transport-Security` (apenas quando `X-Forwarded-Proto: https`)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cache-Control: no-store` em rotas de autenticação

### Privacidade e LGPD
- Logs de simulação WhatsApp **mascaram telefone** (`***últimos-4-dígitos`) e nunca registram nome/dosagem do medicamento. Payload completo só com flag explícita `LOG_SENSITIVE_PAYLOADS=true` (default `false`).
- `/api/client-logs` exige autenticação — logs do cliente são atribuídos ao `user_id`, sem origem anônima.
- Auditoria (`auth_events`) registra eventos sem expor senhas ou tokens.

### Isolamento e ownership
- Todas as rotas de domínio carregam `Depends(obter_usuario_logado)` e validam ownership do recurso por `user_id` ou `pertence_ao_usuario`.
- Nenhum endpoint expõe tabelas sensíveis (`auth_events`, `login_attempts*`, `refresh_tokens`, `phone_verification_codes`).

---

## Variáveis de ambiente

Copie `.env.example` para `.env` e configure:

```env
JWT_SECRET=           # obrigatório — gere com: openssl rand -base64 32
JWT_ALG=HS256
GOOGLE_WEB_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
ACCESS_TTL_MIN=15
REFRESH_TTL_DAYS=14
CORS_ALLOW_ORIGINS=http://localhost:8081
ENABLE_MANUAL_MONITOR_ENDPOINT=false
DISABLE_SCHEDULER=false
MONITOR_TOLERANCE_MINUTES=5
MONITOR_SCAN_INTERVAL_MINUTES=5
EXPO_PUSH_ENABLED=false
EXPO_PUSH_API_URL=https://exp.host/--/api/v2/push/send
EXPO_PROJECT_ID=
WHATSAPP_PROVIDER=simulation
EVOLUTION_API_URL=http://127.0.0.1:8080
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE_NAME=prismacare
ENABLE_WHATSAPP_TEST_ENDPOINT=false

# Lockout por par (email, ip)
LOGIN_LOCKOUT_THRESHOLD=5
LOGIN_LOCKOUT_MINUTES=15
LOGIN_LOCKOUT_MAX_MINUTES=60

# Lockout email-only (defesa contra IP spoofing)
EMAIL_LOCKOUT_THRESHOLD=20
EMAIL_LOCKOUT_MINUTES=60
EMAIL_LOCKOUT_MAX_MINUTES=240

# Confiar em X-Real-IP / X-Forwarded-For (mantenha true atrás de Nginx)
TRUST_PROXY_HEADERS=true

# Logar payloads sensíveis no provider simulado (NUNCA true em produção)
LOG_SENSITIVE_PAYLOADS=false

RATE_LIMIT_LOGIN_PER_MIN=10
RATE_LIMIT_REFRESH_PER_MIN=20
RATE_LIMIT_API_PER_MIN=120
RATE_LIMIT_PHONE_SEND_PER_MIN=3
RATE_LIMIT_PHONE_VERIFY_PER_MIN=10
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
```

Em VPS/produção, mantenha `ENABLE_MANUAL_MONITOR_ENDPOINT=false`. Essa flag bloqueia apenas o disparo manual via `POST /api/monitor/varredura`; a execução automática do APScheduler continua funcionando normalmente. Para testes e apresentação, você pode reduzir `MONITOR_TOLERANCE_MINUTES` e `MONITOR_SCAN_INTERVAL_MINUTES` sem editar código.

### Google Sign-In

- `GOOGLE_WEB_CLIENT_ID` é usado pelo backend como `audience` na validação do token Google.
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` é usado pelo app como `webClientId`.
- Além do Web Client ID, o Google Cloud também precisa de um OAuth client Android com package `com.caueshaze.prismacare` e os SHA-1/SHA-256 do development build.
- Google Sign-In não funciona no Expo Go. A validação deve ser feita em Android development build.

### WhatsApp Provider

- `WHATSAPP_PROVIDER=simulation` mantém o envio simulado para desenvolvimento e testes.
- `WHATSAPP_PROVIDER=evolution` ativa o envio real via Evolution API.
- O login por telefone envia um código de 6 dígitos pelo WhatsApp, válido por 5 minutos.
- `GET /api/whatsapp/status` exige autenticação e nunca expõe `EVOLUTION_API_KEY`.
- `POST /api/whatsapp/test-send` exige autenticação e só funciona com `ENABLE_WHATSAPP_TEST_ENDPOINT=true`.

### Push remoto via Expo

- `EXPO_PUSH_ENABLED=false` desativa o envio remoto por padrão.
- `EXPO_PUSH_API_URL` define o endpoint da Expo Push API usado pelo backend.
- Push remoto exige build nativa; não funciona no Expo Go.
- O fluxo de push remoto é separado dos lembretes locais já usados em `syncDoseReminders`.

---

## Como rodar o backend

### Linux / macOS

```bash
# 1. Crie e ative o ambiente virtual
python3 -m venv .venv
source .venv/bin/activate

# 2. Instale as dependências
pip install -r requirements.txt

# 3. Configure o ambiente
cp .env.example .env
# Edite .env e defina JWT_SECRET

# 4. Suba a API
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Windows (PowerShell)

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> Se aparecer erro de política de execução no Windows:
> `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

### Com Docker

```bash
docker compose up --build
```

O backend sobe na porta `8743` atrás do Nginx. Configure o SSL com Certbot conforme `nginx.conf`.

**Swagger UI:** `http://localhost:8000/docs`

---

## Como rodar o frontend

```bash
# Instale as dependências
npm install

# Inicie o Expo
npm start

# Ou diretamente por plataforma
npm run android
npm run ios
```

Certifique-se de que o backend esteja acessível e defina `EXPO_PUBLIC_API_BASE_URL` no `.env` apontando para o endereço correto (veja `.env.example`).

---

## Testes

A suíte usa `pytest` com `TestClient` do FastAPI e cria um SQLite isolado por teste:

```bash
# Toda a suíte
python -m pytest

# Apenas a regressão de segurança (lockout, headers, senha forte, etc.)
python -m pytest tests/test_security_hardening.py -v
```

Cobertura atual:

- Autenticação por e-mail, Google e telefone (OTP)
- Onboarding e timezone
- CRUD completo (medicamentos, contatos, agendamentos, doses, histórico)
- Fluxo de doses com confirmação e migração de status legados
- Isolamento de dados entre usuários (`test_security_isolation`)
- Hardening de segurança: bypass de IP via X-Forwarded-For, lockout email-only, headers HSTS/COOP/Permissions-Policy, validação de senha, rate limit em lookup-email, mascaramento de PII no log de simulação, exigência de auth em `/api/client-logs`

---

## Observações

- O banco `prismacare.db` é criado automaticamente na primeira execução — não commitar.
- O APScheduler inicia junto com o servidor e varre doses atrasadas no intervalo definido por `MONITOR_SCAN_INTERVAL_MINUTES`.
- A integração real via Evolution API pode ser usada para notificações de contatos e para envio do OTP de login por telefone.
- Push remoto via Expo é opcional (`EXPO_PUSH_ENABLED=true`) e roda em paralelo com a notificação WhatsApp.
- Recuperação de senha está em desenvolvimento.

---

## Licença

MIT © [Cauê Araujo](https://github.com/caueshaze)
