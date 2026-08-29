import { Link } from 'react-router-dom';
import PageHero from '../components/PageHero';

type ComingSoonProps = {
  title: string;
  description: string;
  image: string;
};

export default function ComingSoon({ title, description, image }: ComingSoonProps) {
  return (
    <PageHero image={image} eyebrow="Coming Soon" title={title} subtitle={description} height="tall">
      <Link to="/residences" className="btn btn-gold" style={{ marginTop: 24 }}>
        View Residences Instead
      </Link>
    </PageHero>
  );
}
