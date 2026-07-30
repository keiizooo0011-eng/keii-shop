(()=>{
  const ready=()=>{
    const card=document.querySelector('.welcome-v4-card');
    const video=document.getElementById('welcomeVideo');
    const button=document.getElementById('welcomeClose');
    if(!card) return;
    if(video){
      video.addEventListener('ended',()=>video.play().catch(()=>{}));
      video.addEventListener('error',()=>card.classList.add('video-fallback'));
    }
    const introMessages=[...document.querySelectorAll('.welcome-v4-message')];
    if(introMessages.length){
      let activeIndex=0;
      const showMessage=index=>{
        introMessages.forEach((item,i)=>item.classList.toggle('is-active',i===index));
      };
      window.setTimeout(()=>{
        showMessage(0);
        const messageTimer=window.setInterval(()=>{
          activeIndex=(activeIndex+1)%introMessages.length;
          showMessage(activeIndex);
        },2100);
        const overlay=document.getElementById('welcomeOverlay');
        overlay?.addEventListener('transitionend',()=>{
          if(!overlay.classList.contains('welcome-show')) window.clearInterval(messageTimer);
        });
      },1250);
    }
    if(button){
      button.addEventListener('pointerdown',event=>{
        if(button.disabled) return;
        const rect=button.getBoundingClientRect();
        const ripple=document.createElement('i');
        ripple.className='welcome-v4-ripple';
        ripple.style.left=`${event.clientX-rect.left}px`;
        ripple.style.top=`${event.clientY-rect.top}px`;
        button.appendChild(ripple);
        setTimeout(()=>ripple.remove(),650);
      });
    }
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',ready,{once:true});
  else ready();
})();
