import PeopleHeader from '../PeopleHeader';
import ScheduleBoard from '../ScheduleBoard';
import { useBeirutNow } from '../shifts';
import { BOARD_SECTIONS, BOARD_START, onDutyCount } from '../staffSchedule';
import { useFitHeight } from '../useFitHeight';
import '../../styles/people.css';

/** Our People · Schedule: the day's shifts on one board, and who is working now. */
export default function PeopleSchedule() {
  const now = useBeirutNow();
  const [boardRef, height] = useFitHeight<HTMLDivElement>();

  return (
    <div className="rs-page people-page">
      <PeopleHeader
        title="Schedule"
        lede="Who looks after the building at each hour of the day, and who is on duty right now. Times are Beirut time."
      />
      <ScheduleBoard
        sections={BOARD_SECTIONS}
        startsAt={BOARD_START}
        now={now}
        onDutyCount={onDutyCount(now)}
        height={height}
        boardRef={boardRef}
      />
    </div>
  );
}
