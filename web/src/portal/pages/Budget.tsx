import PageHeader from '../PageHeader';
import BudgetPanel from '../BudgetPanel';

/** The building's budget for the year: the same for every home. */
export default function Budget() {
  return (
    <div className="rs-page">
      <PageHeader
        kicker="The building"
        title="Budget"
        lede="The building’s budget for the year, the same for every home: where the maintenance goes, and the works planned on the building."
      />
      <BudgetPanel />
    </div>
  );
}
