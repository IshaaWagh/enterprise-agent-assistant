"""Create (or reset) a login user.

  python -m scripts.create_user --email you@company.com --name "Ishaa Wagh" --title "Project Manager"
  python -m scripts.create_user --email other@company.com --name "Other" --no-projects
  python -m scripts.create_user --email you@company.com --name "Ishaa Wagh" --reset-password

The password is prompted for, never passed on the command line.
By default the user is granted access to ALL existing projects (use --no-projects to skip).
"""
import argparse
import getpass

from sqlalchemy import select

from app.core.security import hash_password
from app.db.models import Project, ProjectAccess, User
from app.db.session import SessionLocal


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--email", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--title", default="Project Manager")
    p.add_argument("--no-projects", action="store_true", help="do not grant access to existing projects")
    p.add_argument("--reset-password", action="store_true")
    args = p.parse_args()

    email = args.email.strip().lower()
    if "@" not in email:
        print("That does not look like an email address.")
        return 1

    password = getpass.getpass("Password (min 10 characters): ")
    if len(password) < 10:
        print("Password must be at least 10 characters.")
        return 1
    if password != getpass.getpass("Repeat password: "):
        print("Passwords do not match.")
        return 1

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user and not args.reset_password:
            print(f"{email} already exists. Use --reset-password to change the password.")
            return 1
        if user:
            user.password_hash = hash_password(password)
            print(f"Password updated for {email}.")
        else:
            user = User(email=email, full_name=args.name, job_title=args.title, password_hash=hash_password(password))
            db.add(user)
            db.flush()
            print(f"Created user {email}.")

        if not args.no_projects:
            granted = 0
            for project in db.scalars(select(Project)):
                if db.get(ProjectAccess, (user.id, project.id)) is None:
                    db.add(ProjectAccess(user_id=user.id, project_id=project.id, role="owner"))
                    granted += 1
            print(f"Granted access to {granted} project(s).")
        db.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())