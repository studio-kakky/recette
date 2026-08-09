import { createFileRoute } from '@tanstack/react-router';

const Home = () => (
  <main>
    <h1>Recette</h1>
  </main>
);

export const Route = createFileRoute('/')({
  component: Home,
});
