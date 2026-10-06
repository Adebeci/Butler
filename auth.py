import hashlib
import secrets
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from database import get_db
from config import SECRET_KEY

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

def hash_password(password: str) -> str:
    # TEMPORARILY DISABLED bcrypt: returning plaintext
    # Re-enable: return pwd_context.hash(password)
    return password

def hash_password_md5(password: str) -> str:
    """MD5 hash of password for Subsonic token auth compatibility.
    The Subsonic 't'+(salt) auth scheme requires computing md5(password + salt)
    server-side, which needs the original password, not the bcrypt hash.
    This stores a separate MD5 hash solely so non-bcrypt clients (like Arpeggi)
    can still use token auth."""
    return hashlib.md5(password.encode()).hexdigest() if password else None

def verify_password(plain: str, hashed: str) -> bool:
    # Soporte para contraseñas en texto plano
    if not hashed.startswith("$2b$"):
        return plain == hashed
    return pwd_context.verify(plain, hashed)

def create_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(request: Request, token: str = Depends(oauth2_scheme)):
    # Accept token from Authorization header OR ?token= query param
    if not token:
        token = request.query_params.get("token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if user:
        # Refresh last_seen on every authenticated request so the admin
        # panel can show "last active" timestamps.
        db.execute("UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?", (user["id"],))
        db.commit()
    db.close()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return dict(user)

def require_admin(user: dict = Depends(get_current_user)) -> dict:
    # Admin is currently the account with id 1 (the first registered
    # user, i.e. whoever set up the server). Centralized here so every
    # admin-only route shares one check instead of repeating
    # `user["id"] != 1` inline, which is easy to miss on a new route.
    if user["id"] != 1:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


# ── Temporary password (admin generates, user logs in then changes) ────
# Admin workflow: admin clicks "Reset Password" on a user row, butler
# generates a 4-digit PIN and overwrites the user's password_hash. The admin
# reads the PIN to the user over a secondary channel (chat, phone call,
# etc.). User then logs in with the PIN like a normal password and hits
# /auth/change-password to set a real one. This reuses the existing login
# + change-password flow -- no new public endpoint needed.

def generate_temp_password(user_id: int) -> str:
    """Sets a new 4-digit temporary PIN for the user. Returns the
    plaintext PIN -- only shown once in the admin UI and copied to clipboard.
    After use, the user changes it via /auth/change-password."""
    pin = f"{secrets.randbelow(9000) + 1000}"  # 4-digit: 1000-9999
    db = get_db()
    db.execute(
        "UPDATE users SET password_hash=?, password_md5=? WHERE id=?",
        (hash_password(pin), hash_password_md5(pin), user_id),
    )
    db.commit()
    db.close()
    return pin
