PAN_TO_ME = false;

Template.flag_control.events({
  'click .flag': function(e, tmpl) {
    flag = $(tmpl.find('.icon-flag'));
    if (!flag.hasClass('red')) {
      Meteor.call("flag_resource", flag.parent().attr('id'), Meteor.userId());
      if (!Meteor.userId()) {
        //TODO: doesn't do red if using icon-flag
        flag.addClass('red');
      }
    }
  }
});

Template.home.created = function() {
  Session.set('map_markers_in_view', []);
  Session.set('resources_from_services', []);
  Session.set('display_resource', null);
  Session.set('display_services', []); //all in sidebar
  Session.set('visible_services', []); //the ones shown on map
  Session.set('has_county_select', true);
}

Template.home.destroyed = function() {
  Session.set('map_markers_in_view', []);
  Session.set('resources_from_services', []);
  Session.set('has_county_select', false);
}

Template.home.helpers({
  resource_datums: function() {
    return {
      datums: Resources.find().map(function(resource) {
        return {value:resource.name, _id:resource._id}
      }),
      placeholder: "Search Resource to Show"
    }
  },
  service_datums: function() {
    return Services.find().map(function(service) {
      return {value:service.name, name_route:service.name_route}
    });
  },
});

var colors = ["#74F0F2", "#B3F2C2", "#DCFA9B", "#FABDFC", "#F5A2AD",
              "#BDC9FC", "#A2B2F5", "#F5E1A2", "#AEF5A2", "#42F55D"];
Template.home.rendered = function() {
  var i = -1;
  if (!Session.get('display_services') || Session.get('display_services').length == 0) {
    Session.set(
      'display_services',
      this.data.services.map(
        function(service) {
          i += 1;
          return {color:colors[i], name:service.name, name_route:service.name_route,
                  _id:service._id};
        }
      )
    );
    Session.set(
      'visible_services',
      this.data.services.map(
        function(service) {
          return service._id;
        }
      )
    );
  }
  Deps.autorun(function() {
    Meteor.subscribe(
      'resources_from_services',
      Session.get('display_services'),
      Session.get('county'),
      function() {
        var service_ids = Session.get('display_services').map(
          function(service) {return service._id}
        );
        Resources.find({
          sub_service_ids:{
            $in:service_ids
          }}).forEach(function(resource) {
            add_marker(resource);
          });
      });
  });
  $('#search_services_form').outerWidth($('#services_home').width());
}

Template.home_search_resources.rendered = function() {
  var data = this.data.datums;
  var datums = new Bloodhound({
    datumTokenizer: function(d) { return Bloodhound.tokenizers.whitespace(d.value); },
    queryTokenizer: Bloodhound.tokenizers.whitespace,
    local: data
  });
  datums.initialize();

  $('#search_resources_form').outerWidth($('#titleBox').width());
  $('#search_resources_field').typeahead(null, {
    displayKey: 'value',
    source: datums.ttAdapter()
  }).on('typeahead:selected', function(event, datum) {
    var resource = Resources.findOne({_id:datum._id});
    if (resource) {
      var address = resource.locations.address[0];
      if (address) {
        var coords = address.spatial_location;
        map.panTo(new google.maps.LatLng(coords.lat, coords.lng));
      }
      Session.set('display_resource', resource)
    }
  });
};

Template.map_home.rendered = function() {
  if (!this.rendered) {
    map.initialize_map();
    this.rendered = Session.get('map');
    if (PAN_TO_ME && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function(position) {
        var center = new google.maps.LatLng(position.coords.latitude,
                                            position.coords.longitude);
        if(center) {
          map.panTo(center);
        }
      });
    }
    google.maps.event.addListener(map.gmap, 'bounds_changed', function() {
      Session.set('map_markers_in_view', map.markers_in_bounds());
    });
  }
  $('#search_map_field').outerWidth($('#map_canvas').width())
}

Template.map_home.destroyed = function() {
  Session.set('map', false);
};

Template.resource_access.helpers({
  fields: function() {
    return Object.keys(this).sort();
  },
  values: function() {
    var dict = this;
    return Object.keys(this).sort().map(function(field) {
      return dict[field]
    })
  }
});

Template.resource_well.helpers({
  sub_services: function() {
    return Services.find({_id:{$in:this.sub_service_ids}}, {name:true});
  },
  address: function() {
    return this.locations.address;
  },
  contact: function() {
    var loc = this.locations;
    return {
      name:loc.contacts.name,
      title:loc.contacts.title,
      phones:loc.phones,
      url:loc.internet_resource.url,
      email:loc.internet_resource.email
    }
  },
  has_hours: function() {
    return this.location.hours.length > 0;
  },
  hours: function() {
    return this.locations.hours;
  },
  short_desc: function() {
    return this.locations.short_desc;
  },
  has_access: function() {
    var values = get_values_from_fields(this.locations, ['accessibility', 'audience', 'eligibility', 'fees', 'transportation', 'wait'])
    return values.length > 0;
  },
  access: function() {
    return get_values_from_fields(this.locations, ['accessibility', 'audience', 'eligibility', 'fees', 'transportation', 'wait'])
  },
  languages: function() {
    return this.locations.languages;
  },
  how_to_apply: function() {
    return this.locations.services.how_to_apply
  },
});

Template.resource_hours.helpers({
  day_of_week: function() {
    var fields = ['m', 'tu', 'w', 'th', 'f', 'sa', 'su'];
    var ret = [];
    for (var i = 0; i < fields.length; i++) {
      if (fields[i] in this) {
        ret.push(this[fields[i]]);
      }
    }
    return ret;
  },
  closed: function() {
    return this.closed || (!this.open_time && !this.close_time);
  },
  open: function() {
    return military_to_regular(this.open_time);
  },
  close: function() {
    return military_to_regular(this.close_time);
  }
});

Template.search_map.rendered = function() {
  initialize_map_search();
}

Template.search_services.rendered = function() {
  var data = this.data;
  var services_datums = new Bloodhound({
    datumTokenizer: function(d) { return Bloodhound.tokenizers.whitespace(d.value); },
    queryTokenizer: Bloodhound.tokenizers.whitespace,
    local: data
  });
  services_datums.initialize();

  $('#search_services_field').typeahead(null, {
    displayKey: 'value',
    source: services_datums.ttAdapter()
  }).on('typeahead:selected', function(event, datum) {
    var display_services = Session.get('display_services');
    var name_route = datum.name_route;
    var has_service = false;
    for (var i = 0; i < display_services.length; i++) {
      if (display_services[i].name_route == name_route) {
        has_service = true;
        break;
      }
    }
    if (!has_service) {
      var element = display_services.pop();
      map.remove_service(element._id);
      var color = element.color;
      Services.find({name_route:name_route}).forEach(function(service) {
        display_services.unshift(
          {name:service.name, name_route:service.name_route,
           _id:service._id, color:color}
        );
        Session.set('display_services', display_services);
      });
    }
  });
}

Template.service_box.events({
  'click .serviceBox': function(e, tmpl) {
    var box = $(e.target).closest('.serviceBox');
    var color_index = colors.indexOf(box.attr('color'));
    var service = Session.get('display_services')[color_index];
    var visibles = Session.get('visible_services');
    var index = visibles.indexOf(service._id);
    if (box.hasClass('selected')) {
      if (index > -1) {
        visibles.splice(index, 1);
        Session.set('visible_services', visibles);
      }
      adjust_map_display(service, remove_marker);
      box.removeClass('selected');
      box.css('background-color', '#fff');
    } else {
      if (index == -1) {
        visibles.push(service);
        Session.set('visible_services', visibles);
      }
      adjust_map_display(service, add_existing_marker);
      box.addClass('selected');
      box.css('background-color', box.attr('color'));
    }
  }
});

Template.services_sidebar.helpers({
  services: function() {
    return Session.get('display_services');
  }
});

Template.services_sidebar.rendered = function() {
  add_all_selected();
  $('#map_canvas').css("height", $('#services_home').height());
  $('#display_home').css("height", $('#services_home').height());
  $('.search-query.tt-hint').width('inherit');
}

Template.show_map_resources.helpers({
  has_map_resources: function() {
    return Session.get('map_markers_in_view').length > 0;
  },
  map_resources: function() {
    var ret = [];
    var display_resource = Session.get('display_resource');
    var display_services = Session.get('display_services');
    var visible_services = Session.get('visible_services');
    console.log(display_resource);
    if (display_resource) {
      var resource_id = display_resource._id;
      ret.push(display_resource);
    } else {
      var resource_id = "blank";
    }
    Resources.find({_id:{$in:Session.get('map_markers_in_view'), $ne:resource_id}}).forEach(function(resource) {
      var services = resource.sub_service_ids;
      for (var i = 0; i < display_services.length; i++) {
        if (visible_services.indexOf(display_services[i]._id) > -1 && resource.sub_service_ids.indexOf(display_services[i]._id) > -1) {
              ret.push(resource);
              break;
        }
      }
    });
    return ret;
  }
});

var initialize_map_search = function() {
  var input = document.getElementById('search_map_field');
  var autocomplete = new google.maps.places.Autocomplete(input, {types:['geocode']});
  google.maps.event.addListener(autocomplete, 'place_changed', function() {
    var place = autocomplete.getPlace();
    if (place.geometry) {
      map.panTo(place.geometry.location);
    } else {
      input.placeholder = 'Change Location';
    }
  });
};

var remove_all_markers = function() {
  map.remove_all_markers();
}

var add_marker = function(resource) {
  var addresses = resource.locations.address;
  for (var i = 0; i < addresses.length; i++) {
    var adrs = addresses[i];
    if (typeof adrs.spatial_location.lat !== 'undefined' &&
        typeof adrs.spatial_location.lng !== 'undefined') {
      var exists = map.marker_exists(resource._id, i);
      if (!exists[0]) {
        var icon = get_icon_for_resource(resource);
        map.add_new_marker({
          id:resource._id, position:i, title:resource.name,
          lat:adrs.spatial_location.lat,
          lng:adrs.spatial_location.lng,
          services:resource.sub_service_ids,
          icon:icon});
      }
    }
  }
};

var add_all_selected = function() {
  $('.serviceBox').addClass('selected');
  _.each($('.serviceBox').not('.titleBox'), function(box) {
    box.style.backgroundColor = box.getAttribute('color');
  });
}

var add_existing_marker = function(resource) {
  map.add_existing_marker(resource);
};

var adjust_map_display = function(service, f) {
  Resources.find({sub_service_ids:service._id}).forEach(function(resource) {
    f(resource);
  });
};

var get_icon_for_resource = function(resource) {
  var display_services = Session.get('display_services');
  var icon = false;
  resource.sub_service_ids.forEach(function(service_id) {
    display_services.forEach(function(service) {
      if (service._id == service_id) {
        icon = '/gflags/' + icon_from_color(service.color);
      }
    });
  });
  return icon;
}

var icons = ["paleblue_MarkerA.png", "green_MarkerA.png", "yellow_MarkerA.png",
              "pink_MarkerA.png", "red_MarkerA.png", "blue_MarkerA.png"]
var icon_from_color = function(color) {
  return icons[colors.indexOf(color)];
}

var military_to_regular = function(time) {
  //convert military, e.g. 1700 --> 5pm
  if (time == null || time < 0 || time > 2400) {
    return null;
  } else {
    var modifier = 'am';
    time = Math.floor(time); //juuuust in case it's non-int
    if (time >= 1200) {
      modifier = 'pm';
      time = time - 1200;
    }
    var hour = Math.floor(time / 100);
    if (hour == 0) {
      hour = 12;
    }
    var minute = (time % 100).toString();
    if (minute < 10) {
      minute = '0' + minute;
    }
    return hour.toString() + ':' + minute;
  }
}

var remove_all_selected = function() {
  $('.selected').not('.titleBox').css('background-color', "#fff");
  $('.selected').removeClass('selected');
}

var remove_marker = function(resource) {
  map.remove_marker(resource);
}

var get_values_from_fields = function(loc, fields) {
  var ret = {};
  fields.forEach(function(field) {
    var value = loc[field];
    if (value && value.length > 0) {
      ret[field] = value
    }
  });
  return ret
}