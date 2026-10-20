declare module '*.module.scss' {
	const classes: { readonly [key: string]: string };
	export default classes;
}

declare module '*.png' {
	const src: string;
	export default src;
}
