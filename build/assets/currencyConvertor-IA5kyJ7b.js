const n=(r,t="INR")=>new Intl.NumberFormat("en-IN",{style:"currency",currency:t,minimumFractionDigits:0}).format(r);export{n as c};
