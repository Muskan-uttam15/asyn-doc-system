from __future__ import annotations

import os
import time
import json
import uuid
import random
import string
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.orm import Session

from app.workers.celery_app import celery_app
from app.core.config import settings
from app.core.redis_client import publish_progress
from app.models.document import ProcessingJob, Document, JobStatus
