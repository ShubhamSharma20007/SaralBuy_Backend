const f=r=>{if(typeof r!="string"||!r.trim())return"?";let t="";return r.split(" ").forEach(e=>{if(e&&typeof e[0]=="string"){if(t.length===2)return t;t+=e[0].toUpperCase()}}),t||"?"};export{f};
