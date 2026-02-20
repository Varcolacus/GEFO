"""
GEFO Data Update Scheduler
Uses APScheduler to run monthly data ingestion jobs.
"""
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime

logger = logging.getLogger("gefo.scheduler")

scheduler = BackgroundScheduler()


def job_worldbank_update():
    """Monthly World Bank macro data refresh."""
    logger.info("=== SCHEDULED JOB: World Bank data update started ===")
    try:
        from app.core.database import SessionLocal
        from app.ingestion.worldbank import fetch_wb_indicator, WB_INDICATORS
        from app.models.country import Country

        db = SessionLocal()
        try:
            countries = db.query(Country).all()
            year = datetime.now().year - 1  # Most recent available year
            updated = 0

            for c in countries:
                try:
                    gdp = fetch_wb_indicator(c.iso_code, "NY.GDP.MKTP.CD", year)
                    if gdp is not None:
                        c.gdp = gdp
                        updated += 1
                except Exception as e:
                    logger.debug(f"Skip {c.iso_code}: {e}")

            db.commit()
            logger.info(f"World Bank update complete: {updated} countries refreshed")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"World Bank update job failed: {e}", exc_info=True)


def job_comtrade_update():
    """Monthly UN Comtrade trade flow refresh."""
    logger.info("=== SCHEDULED JOB: UN Comtrade data update started ===")
    try:
        from app.ingestion.comtrade import run_comtrade_ingestion
        year = datetime.now().year - 1
        count = run_comtrade_ingestion(year)
        logger.info(f"Comtrade update complete: {count} records ingested")
    except Exception as e:
        logger.error(f"Comtrade update job failed: {e}", exc_info=True)


def job_health_check():
    """Weekly health check — logs DB stats."""
    logger.info("=== SCHEDULED JOB: Health check ===")
    try:
        from app.core.database import SessionLocal
        from app.models.country import Country
        from app.models.trade_flow import TradeFlow
        from app.models.port import Port
        from app.models.shipping_density import ShippingDensity
        from sqlalchemy import func

        db = SessionLocal()
        try:
            stats = {
                "countries": db.query(func.count(Country.id)).scalar(),
                "trade_flows": db.query(func.count(TradeFlow.id)).scalar(),
                "ports": db.query(func.count(Port.id)).scalar(),
                "shipping_density": db.query(func.count(ShippingDensity.id)).scalar(),
            }
            logger.info(f"DB stats: {stats}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)


def start_scheduler():
    """
    Register and start all scheduled jobs.
    Called once at application startup.
    """
    if scheduler.running:
        logger.warning("Scheduler already running, skipping start")
        return

    # Monthly World Bank refresh — 1st of each month at 02:00
    scheduler.add_job(
        job_worldbank_update,
        CronTrigger(day=1, hour=2, minute=0),
        id="worldbank_monthly",
        name="Monthly World Bank data update",
        replace_existing=True,
    )

    # Monthly Comtrade refresh — 5th of each month at 04:00
    # (offset from World Bank to spread load)
    scheduler.add_job(
        job_comtrade_update,
        CronTrigger(day=5, hour=4, minute=0),
        id="comtrade_monthly",
        name="Monthly UN Comtrade data update",
        replace_existing=True,
    )

    # Weekly health check — every Monday at 06:00
    scheduler.add_job(
        job_health_check,
        CronTrigger(day_of_week="mon", hour=6, minute=0),
        id="health_weekly",
        name="Weekly health check",
        replace_existing=True,
    )

    scheduler.start()

    jobs = scheduler.get_jobs()
    logger.info(f"Scheduler started with {len(jobs)} jobs:")
    for job in jobs:
        logger.info(f"  - {job.name} (next run: {job.next_run_time})")


def stop_scheduler():
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


def get_scheduler_status() -> dict:
    """Return current scheduler status and next run times."""
    jobs = scheduler.get_jobs() if scheduler.running else []
    return {
        "running": scheduler.running,
        "jobs": [
            {
                "id": job.id,
                "name": job.name,
                "next_run": str(job.next_run_time) if job.next_run_time else None,
            }
            for job in jobs
        ],
    }
