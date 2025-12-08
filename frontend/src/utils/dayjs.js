import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import duration from 'dayjs/plugin/duration';

// Extend dayjs with plugins
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(duration);

// Set default timezone to IST (Indian Standard Time)
dayjs.tz.setDefault('Asia/Kolkata');

export default dayjs;
