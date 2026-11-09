import styles from "./Button.module.css";

function Button({ children, variant = "primary", className = "", ...props }) {
  const classes = `${styles.button} ${styles[variant]} ${className}`.trim();

  if (props.href) {
    const { href, ...anchorProps } = props;
    return <a className={classes} href={href} {...anchorProps}>{children}</a>;
  }

  return <button className={classes} {...props}>{children}</button>;
}

export default Button;
