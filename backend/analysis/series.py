"""Load observations into pandas. Excluded readings are always left out."""

import operator
import sqlite3
from datetime import date, datetime, timedelta

import pandas as pd

OPS = {
    "<": operator.lt,
    "<=": operator.le,
    ">": operator.gt,
    ">=": operator.ge,
    "==": operator.eq,
}


def to_date(value) -> date:
    if isinstance(value, datetime):  # includes pandas.Timestamp
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def iso(value) -> str:
    return to_date(value).isoformat()


def days(n: int) -> timedelta:
    return timedelta(days=n)


def load_frame(conn: sqlite3.Connection, metric: str, start=None, end=None) -> pd.DataFrame:
    """Rows of one metric between start and end (inclusive), oldest first."""
    sql = "SELECT id, date, value FROM observations WHERE metric = ? AND is_excluded = 0"
    params: list = [metric]
    if start is not None:
        sql += " AND date >= ?"
        params.append(iso(start))
    if end is not None:
        sql += " AND date <= ?"
        params.append(iso(end))
    sql += " ORDER BY date, id"
    df = pd.read_sql_query(sql, conn, params=params)
    df["date"] = pd.to_datetime(df["date"])
    return df.drop_duplicates("date", keep="first").set_index("date")


def load_series(conn: sqlite3.Connection, metric: str, start=None, end=None) -> tuple[pd.Series, pd.Series]:
    """(values, observation ids), both indexed by date."""
    df = load_frame(conn, metric, start, end)
    return df["value"].astype(float), df["id"]
