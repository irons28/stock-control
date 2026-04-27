function Button({ children, onClick, variant = "primary", disabled = false, type = "button" }) {
  const classes = variant === "secondary" ? "button secondary" : "button";

  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export default Button;
