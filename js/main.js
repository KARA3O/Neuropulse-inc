document.getElementById('yr').textContent=new Date().getFullYear();
document.getElementById('enquiry').addEventListener('submit',function(e){
  e.preventDefault();
  var v=function(id){return document.getElementById(id).value.trim()};
  var body='Name: '+v('name')+'\nEmail: '+v('email')+'\nNeed: '+v('type')+'\nBudget: '+v('budget')+'\n\n'+v('msg');
  window.location.href='mailto:info@neuropulseinc.com?subject='+encodeURIComponent('Project enquiry from '+v('name'))+'&body='+encodeURIComponent(body);
});
