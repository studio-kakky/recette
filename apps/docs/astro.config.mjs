// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Recette Docs',
			defaultLocale: 'root',
			locales: {
				root: { label: '日本語', lang: 'ja' },
			},
			sidebar: [
				{
					label: '要件定義',
					items: [{ autogenerate: { directory: 'requirements' } }],
				},
				{
					label: '技術',
					items: [{ autogenerate: { directory: 'tech' } }],
				},
			],
		}),
	],
});
