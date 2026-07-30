Date.prototype.monthList = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
Date.prototype.week = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
Date.prototype.parser = {
  day: ["day", "Day", "DAY"],
  date: ["d1", "dd"],
  month: ["mm", "MMM", "Mmm", "mmm", "month", "Month", "MONTH", "month"],
  year: ["YY", "yyyy"],
  epoch: ["UNIX", "epoch"],
};

Date.prototype.addDays = function (n) { this.setDate(this.getDate() + n); return this; };

Date.prototype.build = function (txt, f) {
  for (const e of this.parser.epoch) if (f === e) { this.setTime(txt); return this; }
  const match = txt.match(/\d+/g);
  if (match === null) return undefined;
  const nums = match.map(Number);
  if (nums.length > 3 || nums.length < 2) return undefined;

  let y = 0, m = 0, d = 0;
  let yp = -1, mp = -1, dp = -1;
  let fullYear = true;
  for (let i = 0; i < this.monthList.length; i++) if (new RegExp(this.monthList[i].substring(0, 3), 'i').test(txt)) m = i + 1;
  if (m < 1 && nums.length != 3) return undefined;
  if (m > 0 && nums.length != 2) return undefined;

  for (const month of this.parser.month) mp = Math.max(mp, f.search(month));
  for (const date of this.parser.date) dp = Math.max(dp, f.search(date));
  for (const year of this.parser.year) {
    const n = f.search(year);
    if (n > -1 && year == "YY") fullYear = false;
    yp = Math.max(yp, n);
  }
  if (m < 1) {
    if (mp < yp && mp < dp) m = nums.shift();
    else if (mp > yp && mp > dp) m = nums.pop();
    else { m = nums[1]; nums.splice(1, 1); }
  }

  d = (dp < yp) ? nums.shift() : nums.pop();
  y = nums[0];
  if (!fullYear) y = Math.floor(new Date().getFullYear() / 100) * 100 + y;
  if (d < 1 || m < 1 || y < 1) return undefined;
  this.setMonth(m - 1);
  this.setDate(d);
  this.setFullYear(y);
  if (this.getFormated(f) === txt) return this;
  return undefined;
};

Date.prototype.getFormated = function (f) {
  const largen = function (n, d) { n = String(n); while (n.length < d) n = "0" + n; return n };
  const suffix = function (n) {
    if (n % 10 === 1 && n !== 11) return n + "st";
    if (n % 10 === 2 && n !== 12) return n + "nd";
    if (n % 10 === 3 && n !== 13) return n + "rd";
    return n + 'th';
  };
  if (isNaN(this.getTime())) return undefined;
  f = f.replace("epoch", this.getTime());
  f = f.replace("UNIX", this.getTime());

  f = f.replace("MONTH", this.monthList[this.getMonth()].toUpperCase());
  f = f.replace("Month", this.monthList[this.getMonth()]);
  f = f.replace("month", this.monthList[this.getMonth()].toLowerCase());

  f = f.replace("MMM", this.monthList[this.getMonth()].substring(0, 3).toUpperCase());
  f = f.replace("Mmm", this.monthList[this.getMonth()].substring(0, 3));
  f = f.replace("mmm", this.monthList[this.getMonth()].substring(0, 3).toLowerCase());
  f = f.replace("mm", largen(this.getMonth() + 1, 2));

  f = f.replace("yyyy", largen(this.getFullYear(), 4));
  f = f.replace("YY", largen(this.getFullYear() % 100, 2));

  f = f.replace("DAY", this.week[this.getDay()].toUpperCase());
  f = f.replace("day", this.week[this.getDay()].toLowerCase());

  f = f.replace("Day", this.week[this.getDay()]);
  f = f.replace("dd", largen(this.getDate(), 2));
  f = f.replace("dth", suffix(this.getDate()));
  f = f.replace("d1", this.getDate());
  return f;
};

Date.prototype.isValidFormat = function (f) {
  const d = new Date(1999, 1, 1);
  const n = new Date(2222, 2, 2).build(d.getFormated(f), f);
  return Boolean(n && d.getTime() === n.getTime());
};

Date.isDate = function (t) {
  const regex = /^\d{4}-[01]\d-[0123]\d$/;
  return regex.test(t);
};
