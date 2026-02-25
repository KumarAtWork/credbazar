(function($) {	
	"use strict";

    //Hide Loading Box (Preloader)
	function handlePreloader() {
		if($('.loader-wrap').length){
			$('.loader-wrap').delay(1000).fadeOut(600);
		}
	}

	if ($(".preloader-close").length) {
        $(".preloader-close").on("click", function(){
            $('.loader-wrap').delay(300).fadeOut(600);
        })
    }
    //End Hide Loading Box (Preloader)

    //Search Popup
	if($('#search-popup').length){
		
		//Show Popup
		$('.search-toggler').on('click', function() {
			$('#search-popup').addClass('popup-visible');
		});
		$(document).keydown(function(e){
	        if(e.keyCode === 27) {
	            $('#search-popup').removeClass('popup-visible');
	        }
	    });
		//Hide Popup
		$('.close-search,.search-popup .overlay-layer').on('click', function() {
			$('#search-popup').removeClass('popup-visible');
		});
	}

    //Update Header Style and Scroll to Top
    function headerStyle() {
        if($('.header').length){
            var windowpos = $(window).scrollTop();
            var siteHeader = $('.header');
            var scrollLink = $('.scroll-top');
            if (windowpos >= 150) {
                siteHeader.addClass('fixed_header');
                scrollLink.addClass('open');
            } else {
                siteHeader.removeClass('fixed_header');
                scrollLink.removeClass('open');
            }
        }
    }
    headerStyle();

    //Submenu Dropdown Toggle
    if($('.main_header li.dropdown ul').length){
        $('.main_header .navigation li.dropdown').append('<div class="dropdown-btn"><i class="fa fa-angle-down"></i></div>');
    }

    //Mobile Nav Hide Show
    if($('.mobile-menu').length){
        var mobileMenuContent = $('.main_header .menu_area .main-menu').html();
        $('.mobile-menu .menu-box .menu-outer').append(mobileMenuContent);
        $('.sticky_header .main-menu').append(mobileMenuContent);        
        //Dropdown Button
        $('.mobile-menu li.dropdown .dropdown-btn').on('click', function() {
            $(this).toggleClass('open');
            $(this).prev('ul').slideToggle(500);
        });
        //Dropdown Button
        $('.mobile-menu li.dropdown .dropdown-btn').on('click', function() {
            $(this).prev('.megamenu').slideToggle(900);
        });
        //Menu Toggle Btn
        $('.mobile-nav-toggler').on('click', function() {
            $('body').addClass('mobile-menu-visible');
        });
        //Menu Toggle Btn
        $('.mobile-menu .menu-backdrop,.mobile-menu .close-btn').on('click', function() {
            $('body').removeClass('mobile-menu-visible');
        });
    }

    //Fact Counter + Text Count
	if($('.count-box').length){
		$('.count-box').appear(function(){
	
			var $t = $(this),
				n = $t.find(".count-text").attr("data-stop"),
				r = parseInt($t.find(".count-text").attr("data-speed"), 10);
				
			if (!$t.hasClass("counted")) {
				$t.addClass("counted");
				$({
					countNum: $t.find(".count-text").text()
				}).animate({
					countNum: n
				}, {
					duration: r,
					easing: "linear",
					step: function() {
						$t.find(".count-text").text(Math.floor(this.countNum));
					},
					complete: function() {
						$t.find(".count-text").text(this.countNum);
					}
				});
			}
			
		},{accY: 0});
	}

	// Single Item Carousel
	if ($('.single-item-carousel').length) {
		$('.single-item-carousel').owlCarousel({
			loop:true,
			margin:0,
			nav:false,
			smartSpeed: 500,
			autoplay: 1000,
			navText:[ '<span class="icon-13"></span>', '<span class="icon-13"></span>' ],
			responsive:{
				0:{
					items:1
				},
				480:{
					items:1
				},
				600:{
					items:1
				},
				800:{
					items:1
				},			
				1200:{
					items:1
				}
			}
		});
	}


	// Three Item Carousel
	if ($('.three-item-carousel').length) {
		$('.three-item-carousel').owlCarousel({
			loop:true,
			margin:30,
			nav:true,
			smartSpeed: 500,
			autoplay: 1000,
			responsive:{
				0:{
					items:1
				},
				480:{
					items:1
				},
				600:{
					items:1
				},
				800:{
					items:2
				},			
				1200:{
					items:1
				}

			}
		});    		
	}

	// Five Item Carousel
	if ($('.five-item-carousel').length) {
		$('.five-item-carousel').owlCarousel({
			loop:true,
			margin:30,
			nav:true,
			smartSpeed: 500,
			autoplay: 1000,
			responsive:{
				0:{
					items:1
				},
				480:{
					items:2
				},
				600:{
					items:3
				},
				800:{
					items:4
				},			
				1200:{
					items:5
				}
			}
		});    		
	}

	//Accordion Box
	if ($('.accordion_box').length) {
		// Attach a click event handler to elements with class 'acc-btn' inside '.accordion-box'
		$(".accordion_box").on('click', '.acc-btn', function() {
			// Get the outer accordion box and the specific accordion associated with the clicked button
			var outerBox = $(this).closest('.accordion_box');
			var target = $(this).closest('.accordion');

			// Check if the clicked button does not have the class 'active'
			if (!$(this).hasClass('active')) {
				// Remove the 'active' class from all accordion buttons within the same accordion box
				outerBox.find('.accordion .acc-btn').removeClass('active');
			}

			// Check if the next '.acc-content' element is visible
			if ($(this).next('.acc-content').is(':visible')) {
				return false; // Prevent further action if it's visible
			} else {
				// Add the 'active' class to the clicked button
				$(this).addClass('active');

				// Remove the 'active-block' class from all '.accordion' elements within the same accordion box
				outerBox.find('.accordion').removeClass('active-block');

				// Slide up all '.acc-content' elements within the accordion box
				outerBox.find('.accordion .acc-content').slideUp(300);

				// Add the 'active-block' class to the specific '.accordion'
				target.addClass('active-block');

				// Slide down the next '.acc-content' element
				$(this).next('.acc-content').slideDown(300);
			}
		});
	}

	// Circle Progress Bar
	$(".progress").each(function(){  
		var $bar = $(this).find(".bar");
		var $val = $(this).find("span");
		var perc = parseInt( $val.text(), 10);	  
		$({p:0}).animate({p:perc}, {
		  duration: 3000,
		  easing: "swing",
		  step: function(p) {
			$bar.css({
			  transform: "rotate("+ (45+(p*1.8)) +"deg)", // 100%=180° so: ° = % * 1.8
			  // 45 is to add the needed rotation to have the green borders at the bottom
			});
			$val.text(p|0);
		  }
		});
	});

	//Nice Select
	$(document).ready(function() {
		$('select:not(.ignore)').niceSelect();
	});

	if ($('.shop-details .bxslider').length) {
		$('.shop-details .bxslider').bxSlider({
	        nextSelector: '.shop-details #slider-next',
	        prevSelector: '.shop-details #slider-prev',
	        nextText: '<i class="fa fa-angle-right"></i>',
	        prevText: '<i class="fa fa-angle-left"></i>',
	        mode: 'fade',
	        auto: 'true',
	        speed: '700',
	        pagerCustom: '.shop-details .slider-pager .thumb-box'
	    });
	};

	//Tabs Box
	if($('.tabs-box').length){
		$('.tabs-box .tab-buttons .tab-btn').on('click', function(e) {
			e.preventDefault();
			var target = $($(this).attr('data-tab'));
			
			if ($(target).is(':visible')){
				return false;
			}else{
				target.parents('.tabs-box').find('.tab-buttons').find('.tab-btn').removeClass('active-btn');
				$(this).addClass('active-btn');
				target.parents('.tabs-box').find('.tabs-content').find('.tab').fadeOut(0);
				target.parents('.tabs-box').find('.tabs-content').find('.tab').removeClass('active-tab');
				$(target).fadeIn(100);
				$(target).addClass('active-tab');
			}
		});
	}

	//Jquery Spinner / Quantity Spinner
	if($('.quantity-spinner').length){
		$("input.quantity-spinner").TouchSpin({
		  verticalbuttons: true
		});
	}

	//LightBox / Fancybox
	if($('.lightbox-image').length) {
		$('.lightbox-image').fancybox({
			openEffect  : 'fade',
			closeEffect : 'fade',
			helpers : {
				media : {}
			}
		});
	}

    // Scroll to a Specific Div
	if($('.scroll-to-target').length){
		$(".scroll-to-target").on('click', function() {
			var target = $(this).attr('data-target');
		   // animate
		   $('html, body').animate({
			   scrollTop: $(target).offset().top
			 }, 1000);	
		});
	}
    // End Scroll to a Specific Div

    // Elements Animation
	if($('.wow').length){
		var wow = new WOW({
		mobile:       false
		});
		wow.init();
	}

	// ------------------------------- AOS Animation
    if ($("[data-aos]").length) { 
        AOS.init({
        duration: 1000,
        mirror: true
      });
    }

    // End Elements Animation

	/* ==========================================================================
    When document is Scrollig, do
    ========================================================================== */
	
	$(window).on('scroll', function() {
		headerStyle();
	});
    
    $(window).on('load', function() {
		handlePreloader();
	});
	

})(window.jQuery);



// owl carousel js


