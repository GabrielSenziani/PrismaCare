from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.database import init_db
from app.middleware.security_middleware import SecurityMiddleware
from app.routes.user_route import router as user_router
from app.routes.medicamento_route import router as medicamento_router
from app.routes.contato_route import router as contato_router
from app.routes.agendamento_route import router as agendamento_router
from app.routes.dose_route import router as dose_router
from app.routes.confirmacao_route import router as confirmacao_router
from app.routes.notificacao_route import router as notificacao_router
from app.routes.auth_route import router as auth_router
from app.routes.monitor_route import router as monitor_router
from app.routes.historico_route import router as historico_router
from app.routes.whatsapp_route import router as whatsapp_router
from app.routes.push_token_route import router as push_token_router
from app.services.monitor_service import varrer_e_notificar


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if not settings.disable_scheduler:
        scheduler = BackgroundScheduler()
        scheduler.add_job(
            varrer_e_notificar,
            "interval",
            minutes=settings.monitor_scan_interval_minutes,
            id="monitor_varredura",
        )
        scheduler.start()
    yield
    if not settings.disable_scheduler:
        scheduler.shutdown()


app = FastAPI(title="PrismaCare API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityMiddleware)

app.include_router(auth_router, prefix="/api")
app.include_router(user_router, prefix="/api", tags=["Usuários"])
app.include_router(medicamento_router, prefix="/api", tags=["Medicamentos"])
app.include_router(contato_router, prefix="/api", tags=["Contatos"])
app.include_router(agendamento_router, prefix="/api", tags=["Agendamentos"])
app.include_router(confirmacao_router, prefix="/api", tags=["Confirmações"])
app.include_router(notificacao_router, prefix="/api", tags=["Notificações"])
app.include_router(monitor_router, prefix="/api", tags=["Monitor"])
app.include_router(whatsapp_router, prefix="/api", tags=["WhatsApp"])
app.include_router(push_token_router, prefix="/api")
app.include_router(dose_router, prefix="/api", tags=["Doses"])
app.include_router(historico_router, prefix="/api", tags=["Doses"])


@app.get("/")
def home():
    return {"message": "PrismaCare API funcionando"}
